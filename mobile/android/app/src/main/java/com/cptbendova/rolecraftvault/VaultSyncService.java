package com.cptbendova.rolecraftvault;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.lang.ref.WeakReference;
import java.util.function.Consumer;

/** An explicitly enabled, unlocked session, never a boot/unlock background job. */
public final class VaultSyncService extends Service {
    public static final String CHANNEL_ID = "vault-device-sync";
    private static final String ACTION_START = "rolecraft.sync.START";
    private static final String ACTION_STOP = "rolecraft.sync.STOP";
    private static final int NOTIFICATION_ID = 19;
    private static final long LEASE_MS = 90_000L;
    // Android 15+ dataSync is capped at six background hours per 24 hours,
    // shared with other dataSync services. onTimeout remains authoritative.
    // https://developer.android.com/develop/background-work/services/fgs/timeout
    // https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
    private static final long SESSION_MS = (5 * 60 + 50) * 60_000L;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static volatile boolean active;
    private static volatile long leaseUntil;
    private static volatile long sessionUntil;
    private static volatile long generation;
    private static WeakReference<MainActivity> owner = new WeakReference<>(null);
    private static Runnable stopped;
    private static Consumer<String> ready;
    private static VaultSyncService instance;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private long powerRenewedAt;
    private long serviceGeneration;

    /** Call on the UI thread, only after the plugin verified unlock and consent. */
    public static void start(MainActivity activity, Runnable onStopped, Consumer<String> onReady) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            MAIN.post(() -> start(activity, onStopped, onReady));
            return;
        }
        if (activity == null || !activity.isSyncForeground() || activity.isFinishing()
            || activity.isDestroyed() || !activity.getPackageName().endsWith(".chat")) {
            onReady.accept("Open and unlock Rolecraft to start background sync.");
            return;
        }
        String notificationProblem = notificationProblem(activity);
        if (notificationProblem != null) { onReady.accept(notificationProblem); return; }
        if (isActive() && owner.get() == activity) { touch(); onReady.accept(null); return; }
        if (ready != null) { onReady.accept("Background sync is already starting. Please wait."); return; }
        if (active || stopped != null) stop(activity);
        final long run;
        synchronized (VaultSyncService.class) {
            run = ++generation;
            owner = new WeakReference<>(activity);
            stopped = onStopped;
            ready = onReady;
            leaseUntil = SystemClock.elapsedRealtime() + LEASE_MS;
            sessionUntil = SystemClock.elapsedRealtime() + SESSION_MS;
        }
        try {
            activity.startForegroundService(new Intent(activity, VaultSyncService.class)
                .setAction(ACTION_START).putExtra("generation", run));
            MAIN.postDelayed(() -> {
                if (generation == run && !active && ready != null) {
                    finish(activity, "Android did not start background sync. Reopen the app and try again.");
                }
            }, 8_000L);
        } catch (RuntimeException failure) {
            finish(activity, "Android could not start background sync. Keep the app open and try again.");
        }
    }

    private static String notificationProblem(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
            Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return "Allow Rolecraft notifications before enabling background sync so its Stop control is visible.";
        }
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return "Enable Rolecraft notifications in Android Settings before starting background sync.";
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(CHANNEL_ID);
        if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
            return "Enable the Device sync notification channel in Android Settings before starting background sync.";
        }
        return null;
    }

    public static boolean isActive() {
        long now = SystemClock.elapsedRealtime();
        return active && now < leaseUntil && now < sessionUntil;
    }

    /** Renew only after a native call has checked that this vault is still unlocked. */
    public static synchronized void touch() {
        if (!isActive()) return;
        leaseUntil = Math.min(sessionUntil, SystemClock.elapsedRealtime() + LEASE_MS);
        MAIN.post(() -> { if (instance != null && isActive()) instance.renewPower(); });
    }

    /** Revocation is synchronous; native sockets stop even when JS is suspended. */
    public static void stop(Context context) { finish(context, "Background sync stopped."); }

    private static void finish(Context context, String reason) {
        Runnable callback;
        Consumer<String> pending;
        MainActivity activity;
        synchronized (VaultSyncService.class) {
            active = false;
            leaseUntil = 0;
            sessionUntil = 0;
            generation++;
            callback = stopped;
            stopped = null;
            pending = ready;
            ready = null;
            activity = owner.get();
            owner.clear();
        }
        // Do not hold the service monitor while calling the transport's lock.
        if (callback != null) try { callback.run(); } catch (RuntimeException ignored) {}
        if (pending != null) MAIN.post(() -> pending.accept(reason));
        if (activity != null) activity.runOnUiThread(activity::onSyncBackgroundStopped);
        if (context != null) try { context.stopService(new Intent(context, VaultSyncService.class)); } catch (RuntimeException ignored) {}
        MAIN.post(() -> { if (instance != null && !active) instance.releasePower(); });
    }

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
            "Device sync", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Your explicitly enabled unlocked sync session. Tap Stop to end it.");
        channel.setShowBadge(false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            finish(this, "Background sync stopped from its notification.");
            stopSelf();
            return START_NOT_STICKY;
        }
        MainActivity activity = owner.get();
        long run = intent == null ? -1 : intent.getLongExtra("generation", -1);
        if (run != generation && intent != null && ACTION_START.equals(intent.getAction())) {
            if (!active && ready == null) stopSelf();
            return START_NOT_STICKY;
        }
        if (intent == null || !ACTION_START.equals(intent.getAction())
            || ready == null || activity == null || !activity.isSyncForeground()
            || activity.isFinishing() || activity.isDestroyed()) {
            finish(this, "Open Rolecraft to start background sync.");
            stopSelf();
            return START_NOT_STICKY;
        }
        serviceGeneration = run;
        try {
            String problem = notificationProblem(this);
            if (problem != null) throw new IllegalStateException(problem);
            Notification notification = notification();
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else startForeground(NOTIFICATION_ID, notification);
            Consumer<String> pending;
            synchronized (VaultSyncService.class) {
                if (run != generation || ready == null) {
                    if (ready == null) stopSelf();
                    return START_NOT_STICKY;
                }
                active = true;
                pending = ready;
                ready = null;
            }
            renewPower();
            if (pending != null) pending.accept(null);
            MAIN.postDelayed(watchdog, 10_000L);
        } catch (RuntimeException failure) {
            finish(this, "Android could not keep background sync active. Check notifications and reopen the app.");
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private Notification notification() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, NOTIFICATION_ID,
            new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), flags);
        PendingIntent stop = PendingIntent.getService(this, NOTIFICATION_ID,
            new Intent(this, VaultSyncService.class).setAction(ACTION_STOP), flags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Rolecraft device sync")
            .setContentText("Vault unlocked for trusted Wi-Fi sync. Tap Stop to end this session.")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stop).build();
    }

    private final Runnable watchdog = new Runnable() {
        @Override public void run() {
            MainActivity activity = owner.get();
            if (!isActive() || serviceGeneration != generation || activity == null
                || activity.isFinishing() || activity.isDestroyed()
                || notificationProblem(VaultSyncService.this) != null) {
                finish(VaultSyncService.this, "Background sync paused. Reopen Rolecraft to resume.");
                stopSelf();
                return;
            }
            MAIN.postDelayed(this, 10_000L);
        }
    };

    private void renewPower() {
        long now = SystemClock.elapsedRealtime();
        if (powerRenewedAt != 0 && now - powerRenewedAt < 20_000L) return;
        powerRenewedAt = now;
        long remaining = Math.max(1, Math.min(LEASE_MS, Math.min(leaseUntil, sessionUntil) - now));
        if (wakeLock == null) {
            PowerManager manager = (PowerManager)getSystemService(POWER_SERVICE);
            if (manager != null) {
                wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rolecraft:device-sync");
                wakeLock.setReferenceCounted(false);
            }
        }
        if (wakeLock != null) wakeLock.acquire(remaining);
        if (wifiLock == null) {
            WifiManager manager = (WifiManager)getApplicationContext().getSystemService(WIFI_SERVICE);
            if (manager != null) {
                wifiLock = manager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "rolecraft:device-sync-wifi");
                wifiLock.setReferenceCounted(false);
            }
        }
        if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
        // WifiLock has no timed acquire. Release via a generation-safe lease
        // timer even if the WebView disappears without its lock callback.
        MAIN.postDelayed(() -> { if (!isActive()) releasePower(); }, remaining + 1);
    }

    private void releasePower() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (RuntimeException ignored) {}
        try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (RuntimeException ignored) {}
        wakeLock = null;
        wifiLock = null;
        powerRenewedAt = 0;
    }

    @Override public void onTimeout(int startId, int fgsType) {
        finish(this, "Android paused background sync after its allowed time. Reopen Rolecraft to resume.");
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        finish(this, "Background sync stopped because Rolecraft was closed.");
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        MAIN.removeCallbacks(watchdog);
        if (instance == this) {
            instance = null;
            if (active || stopped != null || ready != null) finish(this, "Background sync stopped.");
        }
        releasePower();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}

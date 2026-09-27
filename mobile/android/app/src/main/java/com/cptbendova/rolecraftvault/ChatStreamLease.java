package com.cptbendova.rolecraftvault;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

/** Best-effort screen-off protection for one explicit request, never an idle chat. */
final class ChatStreamLease implements AutoCloseable {
    static final long MAX_MILLIS = 10 * 60 * 1000L;
    private final Handler timer = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock cpu;
    private WifiManager.WifiLock wifi;
    private boolean closed;
    private final Runnable deadline;

    ChatStreamLease(Context context, Runnable expired) {
        deadline = () -> { close(); expired.run(); };
        // Missing power privileges must not prevent foreground chat from working.
        try {
            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (power != null) {
                cpu = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Rolecraft:ChatReply");
                cpu.setReferenceCounted(false);
                cpu.acquire(MAX_MILLIS);
            }
        } catch (RuntimeException ignored) { releaseCpu(); }
        try {
            WifiManager manager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (manager != null) {
                wifi = manager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Rolecraft:ChatReply");
                wifi.setReferenceCounted(false);
                wifi.acquire();
            }
        } catch (RuntimeException ignored) { releaseWifi(); }
        timer.postDelayed(deadline, MAX_MILLIS);
    }

    private void releaseCpu() { try { if (cpu != null && cpu.isHeld()) cpu.release(); } catch (RuntimeException ignored) {} cpu = null; }
    private void releaseWifi() { try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (RuntimeException ignored) {} wifi = null; }

    @Override public synchronized void close() {
        if (closed) return;
        closed = true;
        timer.removeCallbacks(deadline);
        releaseWifi();
        releaseCpu();
    }
}

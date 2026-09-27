package com.cptbendova.rolecraftvault;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Explicit, read-only normal-key allowance check. No management credentials. */
@CapacitorPlugin(name = "ProviderBalances")
public class ProviderBalancesPlugin extends Plugin {
    private static final int MAX_RESPONSE = 65536, TIMEOUT_MS = 20000;
    private final ExecutorService workers = Executors.newSingleThreadExecutor();
    private final ExecutorService closers = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
    private boolean unlocked, destroyed;
    private boolean foreground = true;
    private Session active;
    private static final class Session {
        final String id; final PluginCall call;
        volatile HttpURLConnection connection;
        volatile boolean cancelled;
        boolean settled;
        ScheduledFuture<?> deadline;
        Session(String id, PluginCall call) { this.id = id; this.call = call; }
    }
    private void available() throws IOException {
        if (destroyed || !foreground || !unlocked || !getContext().getPackageName().equals("com.cptbendova.rolecraftvault.chat")) throw new IOException("Unlock the private vault before checking API balances.");
    }
    private JSObject ok() { JSObject value = new JSObject(); value.put("ok", true); return value; }
    private JSObject failed(String message) { JSObject value = new JSObject(); value.put("ok", false); value.put("error", message); return value; }
    @PluginMethod public synchronized void setUnlocked(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("unlocked", false))) { unlocked = false; stop("API balance check cancelled because the vault locked."); call.resolve(ok()); return; }
        if (destroyed || !foreground || !getContext().getPackageName().equals("com.cptbendova.rolecraftvault.chat")) { call.resolve(failed("Return to the unlocked private app first.")); return; }
        unlocked = true; call.resolve(ok());
    }
    private SharedPreferences prefs(String provider) { return getContext().getSharedPreferences(provider.equals("openrouter") ? "rolecraft-private-chat-openrouter" : "rolecraft-private-image-generation-v1", 0); }
    @PluginMethod public synchronized void status(PluginCall call) {
        try {
            available(); JSObject out = ok(), configured = new JSObject();
            for (String provider : new String[]{"openrouter", "openai", "xai"}) { String prefix = provider.equals("openrouter") ? "" : provider + "."; configured.put(provider, prefs(provider).contains(prefix + "sealed") && prefs(provider).contains(prefix + "iv")); }
            out.put("configured", configured); call.resolve(out);
        } catch (IOException error) { call.resolve(failed(error.getMessage())); }
    }
    @PluginMethod public synchronized void openDashboard(PluginCall call) {
        try {
            available(); final String url = ProviderBalancesCodec.dashboard(call.getString("provider", ""));
            getActivity().runOnUiThread(() -> {
                synchronized (ProviderBalancesPlugin.this) {
                    try { available(); getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); call.resolve(ok()); }
                    catch (Exception error) { call.resolve(failed("Could not open the provider billing page. Unlock the vault and try again.")); }
                }
            });
        } catch (Exception error) { call.resolve(failed("Could not open the provider billing page. Unlock the vault and try again.")); }
    }
    @PluginMethod public synchronized void refresh(PluginCall call) {
        try {
            available(); String provider = call.getString("provider", ""); ProviderBalancesCodec.dashboard(provider);
            if (!provider.equals("openrouter")) { JSObject out = ok(); out.put("provider", provider); out.put("status", "unavailable"); out.put("accountBalance", JSONObject.NULL); call.resolve(out); return; }
            String id = call.getString("requestId", "");
            if (!id.matches("[A-Za-z0-9_-]{1,100}")) throw new IOException("Invalid balance check identity.");
            if (active != null) throw new IOException("Wait for the current balance check or cancel it first.");
            Session session = new Session(id, call); active = session;
            session.deadline = deadlines.schedule(() -> cancelSession(session, "The balance check timed out. Try Refresh when your connection is ready."), TIMEOUT_MS, TimeUnit.MILLISECONDS);
            workers.execute(() -> refresh(session));
        } catch (IOException error) { call.resolve(failed(error.getMessage())); }
        catch (Exception error) { stop("Could not start the balance check."); call.resolve(failed("Could not start the balance check.")); }
    }
    @PluginMethod public synchronized void cancel(PluginCall call) {
        if (active != null && active.id.equals(call.getString("requestId", ""))) stop("API balance check cancelled.");
        call.resolve(ok());
    }
    private synchronized void check(Session session) throws IOException { available(); if (session.cancelled || session.settled || active != session) throw new IOException("API balance check cancelled."); }
    private synchronized void stop(String message) { if (active != null) cancelSession(active, message); }
    private synchronized void cancelSession(Session session, String message) {
        session.cancelled = true; finish(session, failed(message));
        HttpURLConnection connection = session.connection;
        if (connection != null && !closers.isShutdown()) closers.execute(connection::disconnect);
    }
    private synchronized void finish(Session session, JSObject result) {
        if (session.settled) return; session.settled = true;
        if (session.deadline != null) session.deadline.cancel(false);
        if (active == session) active = null;
        session.call.resolve(result);
    }
    private synchronized void success(Session session, JSObject result) throws IOException { check(session); finish(session, result); }
    @Override protected synchronized void handleOnPause() { foreground = false; unlocked = false; stop("API balance check cancelled because the app went into the background."); super.handleOnPause(); }
    @Override protected synchronized void handleOnResume() { foreground = true; super.handleOnResume(); }
    @Override protected synchronized void handleOnDestroy() { destroyed = true; unlocked = false; stop("API balance check cancelled because the app closed."); workers.shutdownNow(); deadlines.shutdownNow(); closers.shutdown(); super.handleOnDestroy(); }
    private String readKey() throws IOException {
        try {
            synchronized (CredentialShare.WRITE_LOCK) {
                SharedPreferences storage = prefs("openrouter");
                KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
                SecretKey key = (SecretKey)store.getKey("rolecraft-private-chat-openrouter-v1", null);
                if (key == null) throw new IOException("missing key");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(storage.getString("iv", ""), Base64.NO_WRAP)));
                String value = new String(cipher.doFinal(Base64.decode(storage.getString("sealed", ""), Base64.NO_WRAP)), StandardCharsets.UTF_8).trim();
                if (!value.matches("[!-~]{24,512}")) throw new IOException("invalid key");
                return value;
            }
        } catch (Exception error) { throw new IOException("Save a valid OpenRouter key in Chat settings first."); }
    }
    private String readLimited(Session session, InputStream input) throws IOException {
        if (input == null) throw new IOException("OpenRouter returned an empty allowance response.");
        try (InputStream stream = input; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = stream.read(buffer)) != -1) { check(session); if (bytes.size() + count > MAX_RESPONSE) throw new IOException("The balance response exceeded the size limit."); bytes.write(buffer, 0, count); }
            check(session); return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    private JSObject summary(JSONObject body) throws Exception {
        JSONObject data = body.optJSONObject("data");
        if (data == null || !data.has("limit") || !data.has("limit_remaining") || !data.has("usage")) throw new IOException("OpenRouter returned an incomplete allowance response.");
        Double limit = ProviderBalancesCodec.amount(data.isNull("limit") ? null : data.opt("limit"), true, false);
        Double remaining = ProviderBalancesCodec.amount(data.isNull("limit_remaining") ? null : data.opt("limit_remaining"), true, true);
        Double usage = ProviderBalancesCodec.amount(data.opt("usage"), false, false);
        if ((limit == null) != (remaining == null)) throw new IOException("OpenRouter returned an incomplete allowance response.");
        String reset = ProviderBalancesCodec.reset(data.opt("limit_reset"));
        JSObject out = ok(); out.put("provider", "openrouter"); out.put("status", "key_allowance"); out.put("accountBalance", JSONObject.NULL); out.put("currency", "USD");
        out.put("limit", limit == null ? JSONObject.NULL : limit); out.put("remaining", remaining == null ? JSONObject.NULL : remaining); out.put("usage", usage);
        out.put("limitReset", reset == null ? JSONObject.NULL : reset); out.put("checkedAt", System.currentTimeMillis()); return out;
    }
    private void refresh(Session session) {
        HttpURLConnection connection = null;
        try {
            check(session); String key = readKey(); check(session);
            connection = (HttpURLConnection)new URL("https://openrouter.ai/api/v1/key").openConnection();
            connection.setInstanceFollowRedirects(false); connection.setRequestMethod("GET"); connection.setConnectTimeout(TIMEOUT_MS); connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty("Authorization", "Bearer " + key); connection.setRequestProperty("Accept", "application/json");
            synchronized (this) { check(session); session.connection = connection; }
            int code = connection.getResponseCode(); check(session);
            if (code != 200) { finish(session, failed(ProviderBalancesCodec.httpError(code))); return; }
            if (connection.getContentLengthLong() > MAX_RESPONSE) { finish(session, failed("The balance response exceeded the size limit.")); return; }
            String text = readLimited(session, connection.getInputStream());
            JSObject result;
            try { result = summary(new JSONObject(text)); } catch (Exception error) { throw new IOException("OpenRouter returned an invalid allowance response. Check the provider dashboard."); }
            success(session, result);
        } catch (Exception error) { finish(session, failed("Could not complete the allowance check. Check the saved key and connection, then try Refresh again.")); }
        finally { if (connection != null) connection.disconnect(); }
    }
}

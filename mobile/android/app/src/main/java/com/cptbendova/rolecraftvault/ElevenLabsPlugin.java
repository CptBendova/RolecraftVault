package com.cptbendova.rolecraftvault;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** ElevenLabs character voices (1.339). Explicit requests to the fixed ElevenLabs
 *  API only; never retries, never follows redirects or returned URLs. The key is
 *  sealed by Android Keystore outside vault data, backups and paired sync. */
@CapacitorPlugin(name = "ElevenLabs")
public class ElevenLabsPlugin extends Plugin {
    private static final String PREFS = "rolecraft-elevenlabs-v1";
    private static final String AAD = "elevenlabs";
    private static final int SPEECH_TIMEOUT_MS = 120000;
    private static final int VOICES_TIMEOUT_MS = 30000;
    private final ExecutorService workers = Executors.newCachedThreadPool();
    private boolean unlocked;
    private boolean foreground = true;
    private boolean destroyed;
    private int epoch;
    private HttpURLConnection speaking;
    private HttpURLConnection listing;

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, 0); }
    private synchronized void available(int expected) throws IOException {
        if (destroyed || !foreground || !unlocked || expected != epoch || !getContext().getPackageName().equals("com.cptbendova.rolecraftvault.chat"))
            throw new IOException("Open and unlock Rolecraft before using ElevenLabs voices.");
    }
    private JSObject ok() { JSObject out = new JSObject(); out.put("ok", true); return out; }
    private JSObject failed(String message) { JSObject out = new JSObject(); out.put("ok", false); out.put("error", message); return out; }

    @PluginMethod public synchronized void setUnlocked(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("unlocked", false))) { unlocked = false; stopAll(); call.resolve(ok()); return; }
        if (destroyed || !foreground || !getContext().getPackageName().equals("com.cptbendova.rolecraftvault.chat")) { call.resolve(failed("Return to the unlocked Rolecraft app first.")); return; }
        unlocked = true;
        call.resolve(ok());
    }

    @PluginMethod public synchronized void status(PluginCall call) {
        try {
            available(epoch);
            JSObject out = ok();
            out.put("configured", prefs().contains("key.sealed") && prefs().contains("key.iv"));
            out.put("secure", true);
            call.resolve(out);
        } catch (IOException error) { call.resolve(failed(error.getMessage())); }
    }

    @PluginMethod public synchronized void setKey(PluginCall call) {
        synchronized (CredentialShare.WRITE_LOCK) {
            try {
                available(epoch);
                String key = ElevenLabsCodec.key(call.getString("key", ""));
                stopAll();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, storageKey());
                cipher.updateAAD(AAD.getBytes(StandardCharsets.US_ASCII));
                byte[] sealed = cipher.doFinal(key.getBytes(StandardCharsets.UTF_8));
                if (!prefs().edit().putString("key.sealed", Base64.encodeToString(sealed, Base64.NO_WRAP))
                    .putString("key.iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).commit())
                    throw new IOException("Could not save the protected ElevenLabs key.");
                call.resolve(ok());
            } catch (IOException error) { call.resolve(failed(error.getMessage())); }
            catch (Exception error) { call.resolve(failed("Android could not protect this API key. Nothing was saved.")); }
        }
    }

    @PluginMethod public synchronized void clearKey(PluginCall call) {
        try {
            available(epoch);
            stopAll();
            if (!prefs().edit().remove("key.sealed").remove("key.iv").commit()) throw new IOException("Could not remove the protected ElevenLabs key.");
            call.resolve(ok());
        } catch (IOException error) { call.resolve(failed(error.getMessage())); }
    }

    @PluginMethod public synchronized void cancel(PluginCall call) { stopAll(); call.resolve(ok()); }

    @PluginMethod public void voices(PluginCall call) {
        final int started;
        final String search, token;
        synchronized (this) {
            started = epoch;
            try {
                available(started);
                search = ElevenLabsCodec.search(call.getString("search", ""));
                token = ElevenLabsCodec.pageToken(call.getString("pageToken", ""));
            } catch (IOException error) { call.resolve(failed(error.getMessage())); return; }
        }
        workers.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String key = readKey();
                String query = "page_size=100" + (search.isEmpty() ? "" : "&search=" + URLEncoder.encode(search, "UTF-8"))
                    + (token.isEmpty() ? "" : "&next_page_token=" + URLEncoder.encode(token, "UTF-8"));
                connection = open("/v2/voices?" + query, "GET", key, "application/json", VOICES_TIMEOUT_MS);
                synchronized (this) { available(started); if (listing != null) listing.disconnect(); listing = connection; }
                int code = connection.getResponseCode();
                available(started);
                if (code < 200 || code >= 300) throw new IOException(ElevenLabsCodec.providerFailure(code, detail(connection, started), key));
                if (connection.getContentLengthLong() > ElevenLabsCodec.MAX_VOICES_RESPONSE) throw new IOException("ElevenLabs returned more data than allowed.");
                String body = new String(readLimited(connection.getInputStream(), ElevenLabsCodec.MAX_VOICES_RESPONSE, started), StandardCharsets.UTF_8);
                JSONObject reply;
                try { reply = new JSONObject(body); } catch (Exception invalid) { throw new IOException("ElevenLabs returned an invalid voice list."); }
                JSONArray rows = reply.optJSONArray("voices");
                if (rows == null) throw new IOException("ElevenLabs returned an invalid voice list.");
                JSArray voices = new JSArray();
                for (int i = 0; i < Math.min(rows.length(), 100); i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (row == null) continue;
                    Object id = row.opt("voice_id"), name = row.opt("name");
                    if (!(id instanceof String) || !ElevenLabsCodec.validVoiceId((String) id) || !(name instanceof String)) continue;
                    String label = ElevenLabsCodec.plain((String) name, 100);
                    if (label.isEmpty()) continue;
                    JSObject voice = new JSObject();
                    voice.put("id", id); voice.put("name", label);
                    voice.put("category", ElevenLabsCodec.category(row.optString("category", "")));
                    voice.put("description", ElevenLabsCodec.plain(row.opt("description") instanceof String ? row.optString("description") : "", 200));
                    JSArray labels = new JSArray();
                    JSONObject tags = row.optJSONObject("labels");
                    if (tags != null) {
                        Iterator<String> keys = tags.keys();
                        while (keys.hasNext() && labels.length() < 6) {
                            String tag = keys.next(); Object text = tags.opt(tag);
                            String k = ElevenLabsCodec.plain(tag, 30).replace('_', ' '), v = text instanceof String ? ElevenLabsCodec.plain((String) text, 40) : "";
                            if (!k.isEmpty() && !v.isEmpty()) labels.put(k + ": " + v);
                        }
                    }
                    voice.put("labels", labels);
                    voices.put(voice);
                }
                boolean more = reply.optBoolean("has_more", false);
                String next = more && reply.opt("next_page_token") instanceof String ? ElevenLabsCodec.responseToken(reply.optString("next_page_token")) : "";
                JSObject out = ok(); out.put("voices", voices); out.put("hasMore", more && !next.isEmpty()); out.put("nextPageToken", next);
                available(started);
                call.resolve(out);
            } catch (IOException error) { call.resolve(failed(safeError(error))); }
            catch (Exception error) { call.resolve(failed("Could not load ElevenLabs voices.")); }
            finally {
                synchronized (this) { if (listing == connection) listing = null; }
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod public void speech(PluginCall call) {
        final int started;
        final String text, voiceId, model;
        final boolean zeroRetention;
        synchronized (this) {
            started = epoch;
            try {
                available(started);
                JSObject request = call.getObject("request");
                if (request == null) throw new IOException("Missing voice request.");
                Object rawText = request.opt("text"), rawVoice = request.opt("voiceId"), rawModel = request.opt("model"), rawZero = request.opt("zeroRetention");
                text = ElevenLabsCodec.text(rawText instanceof String ? (String) rawText : null);
                voiceId = ElevenLabsCodec.voiceId(rawVoice instanceof String ? (String) rawVoice : null);
                model = ElevenLabsCodec.model(rawModel instanceof String ? (String) rawModel : null);
                if (rawZero != null && !(rawZero instanceof Boolean)) throw new IOException("Invalid ElevenLabs privacy setting.");
                zeroRetention = Boolean.TRUE.equals(rawZero);
                // The newest explicit request wins; an earlier one is abandoned.
                if (speaking != null) { speaking.disconnect(); speaking = null; }
            } catch (IOException error) { call.resolve(failed(error.getMessage())); return; }
        }
        workers.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String key = readKey();
                JSONObject outbound = new JSONObject();
                outbound.put("text", text); outbound.put("model_id", model);
                byte[] body = outbound.toString().getBytes(StandardCharsets.UTF_8);
                // Zero retention is an ElevenLabs Enterprise feature; other plans refuse it.
                String path = "/v1/text-to-speech/" + voiceId + "?output_format=" + ElevenLabsCodec.OUTPUT_FORMAT + (zeroRetention ? "&enable_logging=false" : "");
                connection = open(path, "POST", key, "audio/mpeg", SPEECH_TIMEOUT_MS);
                synchronized (this) { available(started); if (speaking != null && speaking != connection) speaking.disconnect(); speaking = connection; }
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true); connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream out = connection.getOutputStream()) { out.write(body); }
                int code = connection.getResponseCode();
                available(started);
                if (code < 200 || code >= 300) throw new IOException(ElevenLabsCodec.providerFailure(code, detail(connection, started), key, text));
                if (connection.getContentLengthLong() > ElevenLabsCodec.MAX_AUDIO) throw new IOException("ElevenLabs returned more data than allowed.");
                byte[] audio = readLimited(connection.getInputStream(), ElevenLabsCodec.MAX_AUDIO, started);
                if (!ElevenLabsCodec.isMp3(audio, connection.getContentType())) throw new IOException("ElevenLabs returned invalid voice audio.");
                available(started);
                synchronized (this) { if (speaking != connection) throw new IOException("Voice playback was replaced by a newer request."); }
                JSObject out = ok(); out.put("audio", Base64.encodeToString(audio, Base64.NO_WRAP)); out.put("mime", "audio/mpeg");
                call.resolve(out);
            } catch (IOException error) { call.resolve(failed(safeError(error))); }
            catch (Exception error) { call.resolve(failed("ElevenLabs voice generation failed.")); }
            finally {
                synchronized (this) { if (speaking == connection) speaking = null; }
                if (connection != null) connection.disconnect();
            }
        });
    }

    private HttpURLConnection open(String path, String method, String key, String accept, int timeout) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(ElevenLabsCodec.HOST + path).openConnection();
        connection.setRequestMethod(method); connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
        connection.setConnectTimeout(30000); connection.setReadTimeout(timeout);
        connection.setRequestProperty("xi-api-key", key); connection.setRequestProperty("Accept", accept);
        return connection;
    }
    private String detail(HttpURLConnection connection, int started) {
        try {
            JSONObject envelope = new JSONObject(new String(readLimited(connection.getErrorStream(), ElevenLabsCodec.MAX_ERROR, started), StandardCharsets.UTF_8));
            Object detail = envelope.opt("detail");
            if (detail instanceof String) return (String) detail;
            if (detail instanceof JSONObject) return ((JSONObject) detail).optString("message", "");
            if (detail instanceof JSONArray) { JSONObject first = ((JSONArray) detail).optJSONObject(0); return first == null ? "" : first.optString("msg", ""); }
        } catch (Exception unavailable) { /* Bounded/non-JSON failures keep the HTTP wording only. */ }
        return "";
    }
    private byte[] readLimited(InputStream stream, int limit, int started) throws IOException {
        if (stream == null) return new byte[0];
        try (InputStream in = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[32768]; int n;
            while ((n = in.read(buffer)) != -1) {
                available(started);
                if (bytes.size() + n > limit) throw new IOException("ElevenLabs returned more data than allowed.");
                bytes.write(buffer, 0, n);
            }
            return bytes.toByteArray();
        }
    }
    private static String safeError(IOException error) {
        // Socket/TLS errors must not surface headers, server bodies or arbitrary URLs.
        if (error.getClass() != IOException.class || error.getMessage() == null) return "The ElevenLabs connection was interrupted. Nothing was retried.";
        return error.getMessage();
    }
    private synchronized void stopAll() {
        epoch++;
        if (speaking != null) { HttpURLConnection c = speaking; speaking = null; workers.execute(c::disconnect); }
        if (listing != null) { HttpURLConnection c = listing; listing = null; workers.execute(c::disconnect); }
    }

    @Override protected synchronized void handleOnPause() { foreground = false; unlocked = false; stopAll(); super.handleOnPause(); }
    @Override protected synchronized void handleOnResume() { foreground = true; super.handleOnResume(); }
    @Override protected synchronized void handleOnDestroy() { destroyed = true; unlocked = false; stopAll(); workers.shutdown(); super.handleOnDestroy(); }

    private SecretKey storageKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(PREFS)) return (SecretKey) store.getKey(PREFS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(PREFS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private String readKey() throws IOException {
        String sealed = prefs().getString("key.sealed", ""), iv = prefs().getString("key.iv", "");
        if (sealed.isEmpty() || iv.isEmpty()) throw new IOException("Add your ElevenLabs API key in Chat connection settings first.");
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, storageKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            cipher.updateAAD(AAD.getBytes(StandardCharsets.US_ASCII));
            return new String(cipher.doFinal(Base64.decode(sealed, Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception error) { throw new IOException("Android could not unlock the saved ElevenLabs key. Add it again in Chat connection settings."); }
    }
}

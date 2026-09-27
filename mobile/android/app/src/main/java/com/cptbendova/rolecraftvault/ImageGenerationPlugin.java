package com.cptbendova.rolecraftvault;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
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
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Private Chat only. Explicit paid requests; never retries or follows returned URLs. */
@CapacitorPlugin(name = "ImageGeneration")
public class ImageGenerationPlugin extends Plugin {
    private static final String PREFS = "rolecraft-private-image-generation-v1";
    private static final int TIMEOUT_MS = 300000;
    private final ExecutorService workers = Executors.newSingleThreadExecutor();
    private final ExecutorService closers = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
    private boolean unlocked;
    private boolean foreground = true;
    private boolean destroyed;
    private Session active;

    private static final class Session {
        final String id;
        final PluginCall call;
        volatile HttpURLConnection connection;
        volatile boolean cancelled;
        boolean settled;
        ScheduledFuture<?> deadline;
        Session(String id, PluginCall call) { this.id = id; this.call = call; }
    }

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, 0); }
    private void available() throws IOException {
        if (destroyed || !foreground || !unlocked || !getContext().getPackageName().equals("com.cptbendova.rolecraftvault.chat"))
            throw new IOException("Open and unlock Rolecraft before generating images.");
    }
    private JSObject ok() { JSObject out = new JSObject(); out.put("ok", true); return out; }
    private JSObject failed(String message) { JSObject out = new JSObject(); out.put("ok", false); out.put("error", message); return out; }

    @PluginMethod public synchronized void setUnlocked(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("unlocked", false))) {
            unlocked = false;
            stop("Image generation stopped because the vault was locked.");
            call.resolve(ok());
            return;
        }
        if (destroyed || !foreground || !getContext().getPackageName().equals("com.cptbendova.rolecraftvault.chat")) {
            call.resolve(failed("Return to the unlocked Rolecraft app first.")); return;
        }
        unlocked = true;
        call.resolve(ok());
    }

    @PluginMethod public synchronized void status(PluginCall call) {
        try {
            available();
            JSObject out = ok();
            for (String provider : new String[]{"openai", "xai"}) out.put(provider, prefs().contains(provider + ".sealed") && prefs().contains(provider + ".iv"));
            out.put("secure", true); call.resolve(out);
        } catch (IOException error) { call.resolve(failed(error.getMessage())); }
    }

    @PluginMethod public synchronized void setKey(PluginCall call) {
        synchronized (CredentialShare.WRITE_LOCK) {
        try {
            available();
            String provider = ImageGenerationCodec.provider(call.getString("provider", ""));
            String key = call.getString("key", "").trim();
            if (key.length() < 16 || key.length() > 512 || !key.matches("[!-~]+")) throw new IOException("Enter a valid API key for this provider.");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, storageKey(provider));
            cipher.updateAAD(provider.getBytes(StandardCharsets.US_ASCII));
            byte[] sealed = cipher.doFinal(key.getBytes(StandardCharsets.UTF_8));
            if (!prefs().edit().putString(provider + ".sealed", Base64.encodeToString(sealed, Base64.NO_WRAP))
                .putString(provider + ".iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).commit())
                throw new IOException("Could not save the protected API key.");
            call.resolve(ok());
        } catch (IOException error) { call.resolve(failed(error.getMessage())); }
        catch (Exception error) { call.resolve(failed("Android could not protect this API key. Nothing was saved.")); }
        }
    }

    @PluginMethod public synchronized void clearKey(PluginCall call) {
        try {
            available();
            String provider = ImageGenerationCodec.provider(call.getString("provider", ""));
            stop("Image generation cancelled because an API key was removed.");
            if (!prefs().edit().remove(provider + ".sealed").remove(provider + ".iv").commit()) throw new IOException("Could not remove the protected API key.");
            call.resolve(ok());
        } catch (IOException error) { call.resolve(failed(error.getMessage())); }
    }

    @PluginMethod public synchronized void generate(PluginCall call) {
        try {
            available();
            if (active != null) throw new IOException("Wait for the current image or cancel it first.");
            JSObject request = call.getObject("request");
            if (request == null) throw new IOException("Missing image generation request.");
            String id = request.optString("requestId", "");
            if (!id.matches("[A-Za-z0-9_-]{1,100}")) throw new IOException("Invalid image request identity.");
            Session session = new Session(id, call);
            active = session;
            session.deadline = deadlines.schedule(() -> cancelSession(session, "Image generation timed out after five minutes. It was not retried; the provider may still charge for the request."), TIMEOUT_MS, TimeUnit.MILLISECONDS);
            workers.execute(() -> generate(session, request));
        } catch (IOException error) { call.resolve(failed(error.getMessage())); }
        catch (Exception error) { stop("Image generation is unavailable. Reopen Chat and try again."); call.resolve(failed("Image generation is unavailable. Reopen Chat and try again.")); }
    }

    @PluginMethod public synchronized void cancel(PluginCall call) {
        String id = call.getString("requestId", "");
        if (active != null && active.id.equals(id)) stop("Image generation cancelled. The provider may still charge for a request already sent.");
        call.resolve(ok());
    }

    private synchronized void check(Session session) throws IOException {
        available();
        if (session.cancelled || session.settled || active != session) throw new IOException("Image generation cancelled.");
    }
    private synchronized void stop(String message) { if (active != null) cancelSession(active, message); }
    private synchronized void cancelSession(Session session, String message) {
        session.cancelled = true;
        finish(session, failed(message));
        HttpURLConnection connection = session.connection;
        if (connection != null && !closers.isShutdown()) closers.execute(connection::disconnect);
    }
    private synchronized void finish(Session session, JSObject result) {
        if (session.settled) return;
        session.settled = true;
        if (session.deadline != null) session.deadline.cancel(false);
        if (active == session) active = null;
        session.call.resolve(result);
    }
    private synchronized void success(Session session, JSObject result) throws IOException { check(session); finish(session, result); }

    @Override protected synchronized void handleOnPause() {
        foreground = false; unlocked = false;
        stop("Image generation stopped because the app went into the background. Return and generate again when ready.");
        super.handleOnPause();
    }
    @Override protected synchronized void handleOnResume() { foreground = true; super.handleOnResume(); }
    @Override protected synchronized void handleOnDestroy() {
        destroyed = true; unlocked = false;
        stop("Image generation stopped because the app closed.");
        workers.shutdownNow(); deadlines.shutdownNow(); closers.shutdown();
        super.handleOnDestroy();
    }

    private void generate(Session session, JSONObject request) {
        HttpURLConnection connection = null;
        try {
            check(session);
            String provider = ImageGenerationCodec.provider(request.optString("provider", ""));
            String model = request.optString("model", ""); ImageGenerationCodec.model(provider, model);
            Object rawPrompt = request.opt("prompt");
            if (!(rawPrompt instanceof String)) throw new IOException("Write an image prompt first.");
            String prompt = ImageGenerationCodec.prompt((String) rawPrompt);
            boolean openai = provider.equals("openai");
            String resolution = request.optString("resolution", "standard");
            String shape = ImageGenerationCodec.shape(request.optString("shape", "square"), resolution, openai);
            String quality = ImageGenerationCodec.quality(request.optString("quality", "auto"), openai, model);
            Object rawReferences = request.opt("references");
            if (rawReferences != null && !(rawReferences instanceof JSONArray)) throw new IOException("Invalid reference images.");
            JSONArray references = request.optJSONArray("references");
            int count = references == null ? 0 : references.length();
            if (count > 4) throw new IOException("Choose no more than four reference images.");
            ImageGenerationCodec.Picture[] images = new ImageGenerationCodec.Picture[count];
            int total = 0;
            for (int i = 0; i < count; i++) {
                check(session);
                Object value = references.opt(i);
                if (!(value instanceof String)) throw new IOException("Invalid reference image.");
                images[i] = ImageGenerationCodec.reference((String) value);
                total += images[i].bytes.length;
                if (total > ImageGenerationCodec.MAX_REFERENCES) throw new IOException("Reference images together must be no larger than 12 MiB.");
            }
            byte[] body;
            String contentType = "application/json";
            if (openai && count > 0) {
                String boundary = "RolecraftImage" + UUID.randomUUID().toString().replace("-", "");
                body = ImageGenerationCodec.multipart(boundary, model, prompt, shape, quality, images);
                contentType = "multipart/form-data; boundary=" + boundary;
            } else {
                JSONObject outbound = new JSONObject();
                outbound.put("model", model); outbound.put("prompt", prompt); outbound.put("n", 1); outbound.put("quality", quality);
                if (openai) { outbound.put("size", shape); outbound.put("output_format", "png"); }
                else {
                    outbound.put("aspect_ratio", shape); outbound.put("resolution", ImageGenerationCodec.resolution(resolution, false)); outbound.put("response_format", "b64_json");
                    JSONArray refs = new JSONArray();
                    for (ImageGenerationCodec.Picture image : images) refs.put(new JSONObject().put("type", "image_url").put("url", image.dataUrl()));
                    if (count == 1) outbound.put("image", refs.getJSONObject(0));
                    else if (count > 1) outbound.put("images", refs);
                }
                body = outbound.toString().getBytes(StandardCharsets.UTF_8);
            }
            if (body.length > ImageGenerationCodec.MAX_REQUEST) throw new IOException("The image request is too large.");
            check(session);
            String key = readKey(provider);
            check(session);
            String endpoint = (openai ? "https://api.openai.com/v1/images/" : "https://api.x.ai/v1/images/") + (count == 0 ? "generations" : "edits");
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            session.connection = connection;
            connection.setRequestMethod("POST"); connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
            connection.setConnectTimeout(30000); connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty("Authorization", "Bearer " + key);
            connection.setRequestProperty("Content-Type", contentType); connection.setRequestProperty("Accept", "application/json");
            connection.setDoOutput(true); connection.setFixedLengthStreamingMode(body.length);
            check(session);
            try (OutputStream out = connection.getOutputStream()) {
                for (int offset = 0; offset < body.length; offset += 32768) { check(session); out.write(body, offset, Math.min(32768, body.length - offset)); }
            }
            int code = connection.getResponseCode();
            check(session);
            if (code < 200 || code >= 300) {
                JSONObject error = new JSONObject();
                try {
                    JSONObject envelope = new JSONObject(readLimited(session, connection.getErrorStream(), 65536));
                    JSONObject nested = envelope.optJSONObject("error");
                    if (nested != null) error = nested;
                    else {
                        Object detail = envelope.opt("error");
                        if (!(detail instanceof String)) detail = envelope.opt("message");
                        if (detail instanceof String) error.put("message", detail);
                    }
                } catch (Exception unavailable) { /* Bounded/non-JSON failures retain HTTP status; never echo the raw body. */ }
                check(session);
                throw new IOException(ImageGenerationCodec.providerFailure(code, provider, httpError(code),
                    errorField(error, "message"), errorField(error, "code"), errorField(error, "type"),
                    errorField(error, "param"), connection.getHeaderField("x-request-id"), key, prompt));
            }
            long length = connection.getContentLengthLong();
            if (length > ImageGenerationCodec.MAX_RESPONSE) throw new IOException("The provider response is too large.");
            String response = readLimited(session, connection.getInputStream(), ImageGenerationCodec.MAX_RESPONSE);
            JSONObject result;
            try { result = new JSONObject(response); }
            catch (Exception invalid) { throw new IOException("The provider returned an invalid image response."); }
            JSONArray data = result.optJSONArray("data");
            JSONObject image = data == null || data.length() != 1 ? null : data.optJSONObject(0);
            if (image == null || Boolean.FALSE.equals(result.opt("respect_moderation")) || Boolean.FALSE.equals(image.opt("respect_moderation")))
                throw new IOException("The provider did not return an image. It may have declined the prompt.");
            Object encoded = image.opt("b64_json");
            if (!(encoded instanceof String)) throw new IOException("The provider did not return inline image data. Remote image links are not downloaded.");
            check(session);
            ImageGenerationCodec.Picture picture = ImageGenerationCodec.result((String) encoded);
            JSObject out = ok(); out.put("provider", provider); out.put("model", model); out.put("dataUrl", picture.dataUrl());
            success(session, out);
        } catch (IOException error) { finish(session, failed(error.getMessage() == null ? "The image connection was interrupted. No request was retried." : safeError(error))); }
        catch (Exception error) { finish(session, failed("Image generation could not finish. Check this provider's key, access and available credit, then try again.")); }
        finally { if (connection != null) connection.disconnect(); session.connection = null; }
    }

    private String readLimited(Session session, InputStream stream, int limit) throws IOException {
        if (stream == null) return "";
        try (InputStream in = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[32768]; int n;
            while ((n = in.read(buffer)) != -1) {
                check(session);
                if (bytes.size() + n > limit) throw new IOException("The provider response is too large.");
                bytes.write(buffer, 0, n);
            }
            return bytes.toString("UTF-8");
        }
    }
    private static String errorField(JSONObject error, String field) {
        Object value = error.opt(field);
        return value instanceof String ? (String) value : "";
    }
    private static String httpError(int code) {
        if (code == 401) return "The provider rejected its API key. Check the key in image settings.";
        if (code == 403) return "This provider account cannot use that image model. Check model access or account verification.";
        if (code == 429) return "The provider reached its rate or credit limit. Check your account before trying again.";
        if (code >= 300 && code < 400) return "The provider requested a redirect. It was blocked to protect your API key.";
        if (code >= 500) return "The image provider is temporarily unavailable. Try again later; no automatic retry was made.";
        return "The image provider rejected the request (HTTP " + code + "). Check the prompt, references and selected model.";
    }
    private static String safeError(IOException error) {
        // Socket/TLS errors must not surface headers, server bodies or arbitrary URLs.
        if (error.getClass() != IOException.class) return "The image connection was interrupted. Check your connection and try again. No automatic retry was made.";
        return error.getMessage();
    }
    private SecretKey storageKey(String provider) throws Exception {
        String alias = PREFS + "-" + provider;
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private String readKey(String provider) throws Exception {
        String sealed = prefs().getString(provider + ".sealed", ""), iv = prefs().getString(provider + ".iv", "");
        if (sealed.isEmpty() || iv.isEmpty()) throw new IOException("Add this provider's API key in image settings first.");
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, storageKey(provider), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            cipher.updateAAD(provider.getBytes(StandardCharsets.US_ASCII));
            return new String(cipher.doFinal(Base64.decode(sealed, Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception error) { throw new IOException("Android could not unlock this saved API key. Add it again in image settings."); }
    }
}

package com.cptbendova.rolecraftvault;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native-only, deliberate credential transfer. No key goes through the WebView. */
final class CredentialShare {
    static final Object WRITE_LOCK = new Object();
    private final Context context;
    private JSONObject offer;
    private String sealed, iv;
    CredentialShare(Context context) { this.context = context; }
    static String provider(String value) throws IOException {
        if (!value.equals("openrouter") && !value.equals("openai") && !value.equals("xai")) throw new IOException("Choose a supported API provider.");
        return value;
    }
    static String keyValue(String value, String name) throws IOException {
        if (value.length() < (name.equals("openrouter") ? 24 : 16) || value.length() > 512 || !value.matches("[!-~]+")) throw new IOException("The shared API key is invalid.");
        return value;
    }
    private void available() throws IOException {
        if (!context.getPackageName().equals("com.cptbendova.rolecraftvault.chat")) throw new IOException("Key sharing needs an updated Rolecraft app.");
    }
    private SharedPreferences prefs(String name) {
        return context.getSharedPreferences(name.equals("openrouter") ? "rolecraft-private-chat-openrouter" : "rolecraft-private-image-generation-v1", 0);
    }
    private String field(String name, String suffix) { return name.equals("openrouter") ? suffix : name + "." + suffix; }
    private SecretKey storageKey(String name) throws Exception {
        String alias = name.equals("openrouter") ? "rolecraft-private-chat-openrouter-v1" : "rolecraft-private-image-generation-v1-" + name;
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(alias)) return (SecretKey)store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private Cipher cipher(String name, int mode, String encodedIv) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        if (mode == Cipher.DECRYPT_MODE) c.init(mode, storageKey(name), new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)));
        else c.init(mode, storageKey(name));
        if (!name.equals("openrouter")) c.updateAAD(name.getBytes(StandardCharsets.US_ASCII));
        return c;
    }
    synchronized void stop() { offer = null; sealed = null; iv = null; }
    synchronized JSONObject metadata() throws Exception {
        available();
        if (offer != null && System.currentTimeMillis() >= offer.getLong("expires")) stop();
        return offer == null ? null : new JSONObject(offer.toString());
    }
    synchronized JSONObject status() throws Exception {
        available(); JSONArray configured = new JSONArray();
        for (String name : new String[]{"openrouter", "openai", "xai"}) if (prefs(name).contains(field(name, "sealed"))) configured.put(name);
        return new JSONObject().put("configured", configured).put("offer", metadata() == null ? JSONObject.NULL : metadata());
    }
    synchronized JSONObject share(String value) throws Exception {
        available(); String name = provider(value);
        try {
            String sourceIv = prefs(name).getString(field(name, "iv"), "");
            String source = prefs(name).getString(field(name, "sealed"), "");
            keyValue(new String(cipher(name, Cipher.DECRYPT_MODE, sourceIv).doFinal(Base64.decode(source, Base64.NO_WRAP)), StandardCharsets.UTF_8), name);
            offer = new JSONObject().put("id", UUID.randomUUID().toString().replace("-", "")).put("provider", name).put("expires", System.currentTimeMillis() + 5 * 60000);
            sealed = source; iv = sourceIv;
            return metadata();
        } catch (Exception e) { stop(); throw new IOException("Save a valid key for this provider on this device first."); }
    }
    synchronized JSONObject pull(String id) throws Exception {
        JSONObject current = metadata();
        if (current == null || !current.getString("id").equals(id)) throw new IOException("Key sharing expired or stopped.");
        String name = current.getString("provider");
        return current.put("key", keyValue(new String(cipher(name, Cipher.DECRYPT_MODE, iv).doFinal(Base64.decode(sealed, Base64.NO_WRAP)), StandardCharsets.UTF_8), name));
    }
    synchronized JSONObject receive(JSONObject data, String id, String value) throws Exception {
        synchronized (WRITE_LOCK) {
        available(); String name = provider(value); long now = System.currentTimeMillis();
        if (!data.optString("id").equals(id) || !data.optString("provider").equals(name) || data.optLong("expires") <= now || data.optLong("expires") > now + 6 * 60000) throw new IOException("Key sharing expired or changed. Refresh the shared keys.");
        String key = keyValue(data.optString("key"), name);
        if (prefs(name).contains(field(name, "sealed"))) throw new IOException("A key is already saved for this provider. Remove it in provider settings first if you want to replace it.");
        Cipher c = cipher(name, Cipher.ENCRYPT_MODE, "");
        String encrypted = Base64.encodeToString(c.doFinal(key.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!prefs(name).edit().putString(field(name, "sealed"), encrypted).putString(field(name, "iv"), Base64.encodeToString(c.getIV(), Base64.NO_WRAP)).commit()) throw new IOException("Could not save the protected API key.");
        return new JSONObject().put("ok", true).put("provider", name);
        }
    }
}

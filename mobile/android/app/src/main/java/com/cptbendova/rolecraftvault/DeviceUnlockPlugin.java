package com.cptbendova.rolecraftvault;

import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "DeviceUnlock")
public class DeviceUnlockPlugin extends Plugin {
    private static final String ALIAS = "rolecraft-device-unlock-v1";
    private static final String PREFS = "rolecraft-device-unlock";
    private static final String CIPHER_TEXT = "ciphertext";
    private static final String IV = "iv";
    private PluginCall activeCall;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, 0);
    }

    private int strongStatus() {
        return BiometricManager.from(getContext()).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        );
    }

    private boolean canTry(int status) {
        // AndroidX documents UNKNOWN as "authentication may still succeed".
        // Hiding the control made those vendor devices impossible even to try.
        return status == BiometricManager.BIOMETRIC_SUCCESS ||
            status == BiometricManager.BIOMETRIC_STATUS_UNKNOWN;
    }

    private boolean available() {
        return canTry(strongStatus());
    }

    private String unavailableReason(int strong) {
        if (canTry(strong)) return "";
        int weak = BiometricManager.from(getContext()).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK
        );
        if (strong == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED &&
            weak == BiometricManager.BIOMETRIC_SUCCESS) {
            return "The enrolled face or fingerprint is not strong enough to protect the vault key. Add a Class 3 fingerprint or face in Android Settings.";
        }
        if (strong == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            return "Add a secure fingerprint or face in Android Settings first.";
        }
        if (strong == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
            return "This device has no Class 3 biometric sensor.";
        }
        if (strong == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE) {
            return "The biometric sensor is unavailable right now. Unlock the phone normally and try again.";
        }
        if (strong == BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED) {
            return "Android requires a security update before this biometric sensor can protect the vault.";
        }
        if (strong == BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED) {
            return "This Android version does not support secure biometric vault unlock.";
        }
        return "Android could not use this device's secure biometric sensor.";
    }

    private boolean enrolled() {
        return prefs().contains(CIPHER_TEXT) && prefs().contains(IV);
    }

    @PluginMethod
    public void status(PluginCall call) {
        int strong = strongStatus();
        JSObject out = new JSObject();
        out.put("available", canTry(strong));
        out.put("enrolled", enrolled());
        out.put("reason", unavailableReason(strong));
        call.resolve(out);
    }

    @PluginMethod
    public void enroll(PluginCall call) {
        String secret = call.getString("secret");
        if (secret == null || secret.length() < 16) {
            call.reject("A valid vault key is required");
            return;
        }
        if (!available()) {
            call.reject("Strong fingerprint or face unlock is not available");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            prompt(call, cipher, "Use fingerprint or face", result -> {
                try {
                    byte[] sealed = result.doFinal(secret.getBytes(StandardCharsets.UTF_8));
                    boolean stored = prefs().edit()
                        .putString(CIPHER_TEXT, Base64.encodeToString(sealed, Base64.NO_WRAP))
                        .putString(IV, Base64.encodeToString(result.getIV(), Base64.NO_WRAP))
                        .commit();
                    if (!stored) throw new IllegalStateException("preferences");
                    JSObject out = new JSObject();
                    out.put("ok", true);
                    finishResolve(call, out);
                } catch (Exception error) {
                    finishReject(call, "Couldn't protect the vault key");
                }
            });
        } catch (Exception error) {
            call.reject("Couldn't prepare biometric unlock");
        }
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        if (!enrolled()) {
            call.reject("Biometric unlock is not set up");
            return;
        }
        try {
            byte[] iv = Base64.decode(prefs().getString(IV, ""), Base64.NO_WRAP);
            byte[] sealed = Base64.decode(prefs().getString(CIPHER_TEXT, ""), Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            prompt(call, cipher, "Unlock Rolecraft Vault", result -> {
                try {
                    String secret = new String(result.doFinal(sealed), StandardCharsets.UTF_8);
                    JSObject out = new JSObject();
                    out.put("ok", true);
                    out.put("secret", secret);
                    finishResolve(call, out);
                } catch (Exception error) {
                    clearEnrollment();
                    finishReject(call, "Biometric unlock needs to be set up again");
                }
            });
        } catch (Exception error) {
            clearEnrollment();
            call.reject("Biometric unlock needs to be set up again");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        clearEnrollment();
        JSObject out = new JSObject();
        out.put("ok", true);
        call.resolve(out);
    }

    private interface CipherResult {
        void accept(Cipher cipher);
    }

    private void prompt(PluginCall call, Cipher cipher, String title, CipherResult success) {
        synchronized (this) {
            if (activeCall != null) {
                call.reject("Another unlock request is already open");
                return;
            }
            activeCall = call;
        }
        /* Capacitor invokes plugin methods on its task handler, but
           BiometricPrompt is a @MainThread API. 1.232 constructed and opened
           it on the bridge worker, so real phones could reject the request
           before Android ever displayed its system prompt. */
        getBridge().executeOnMainThread(() -> {
            try {
                if (!(getActivity() instanceof FragmentActivity)) {
                    finishReject(call, "Biometric unlock is not available in this window");
                    return;
                }
                FragmentActivity activity = (FragmentActivity) getActivity();
                Executor executor = ContextCompat.getMainExecutor(getContext());
                BiometricPrompt prompt = new BiometricPrompt(activity, executor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            Cipher authenticated = result.getCryptoObject() == null ? null : result.getCryptoObject().getCipher();
                            if (authenticated == null) finishReject(call, "Biometric authentication failed");
                            else success.accept(authenticated);
                        }

                        @Override
                        public void onAuthenticationError(int code, CharSequence message) {
                            finishReject(call, code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_USER_CANCELED
                                ? "Biometric unlock cancelled" : String.valueOf(message));
                        }
                    });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle("Your vault stays on this device")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButtonText("Use master password")
                    .build();
                prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
            } catch (Exception error) {
                finishReject(call, "Couldn't open the biometric prompt");
            }
        });
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        } else {
            spec.setUserAuthenticationValidityDurationSeconds(-1);
        }
        generator.init(spec.build());
        return generator.generateKey();
    }

    private synchronized void finishResolve(PluginCall call, JSObject value) {
        if (activeCall != call) return;
        activeCall = null;
        call.resolve(value);
    }

    private synchronized void finishReject(PluginCall call, String message) {
        if (activeCall != call) return;
        activeCall = null;
        call.reject(message);
    }

    private void clearEnrollment() {
        prefs().edit().clear().apply();
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if (store.containsAlias(ALIAS)) store.deleteEntry(ALIAS);
        } catch (Exception ignored) {}
    }
}

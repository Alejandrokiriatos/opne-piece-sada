package com.butterflycafe.admin;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureToken")
public class SecureTokenPlugin extends Plugin {
    private static final String STORE = "bc_secure_settings";
    private static final String TOKEN_KEY = "github_token";
    private static final String KEY_ALIAS = "butterfly_admin_token_key";

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    @PluginMethod
    public void saveToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.trim().isEmpty()) {
            call.reject("El token está vacío");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(token.trim().getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);
            String encoded = Base64.encodeToString(combined, Base64.NO_WRAP);
            getContext().getSharedPreferences(STORE, 0).edit().putString(TOKEN_KEY, encoded).apply();
            JSObject result = new JSObject();
            result.put("saved", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("No se pudo guardar el token cifrado", e);
        }
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(STORE, 0);
            String encoded = prefs.getString(TOKEN_KEY, null);
            JSObject result = new JSObject();
            if (encoded == null) {
                result.put("token", "");
                call.resolve(result);
                return;
            }
            byte[] combined = Base64.decode(encoded, Base64.NO_WRAP);
            int ivLength = 12;
            if (combined.length <= ivLength) throw new IllegalStateException("Datos cifrados incompletos");
            byte[] iv = new byte[ivLength];
            byte[] encrypted = new byte[combined.length - ivLength];
            System.arraycopy(combined, 0, iv, 0, ivLength);
            System.arraycopy(combined, ivLength, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            String token = new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
            result.put("token", token);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("No se pudo recuperar el token cifrado", e);
        }
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        getContext().getSharedPreferences(STORE, 0).edit().remove(TOKEN_KEY).apply();
        call.resolve();
    }
}

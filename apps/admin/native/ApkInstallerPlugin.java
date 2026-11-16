package com.butterflycafe.admin;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    @PluginMethod
    public void install(PluginCall call) {
        String value = call.getString("path");
        if (value == null || value.trim().isEmpty()) {
            call.reject("Falta la ruta del APK");
            return;
        }
        try {
            Uri source = Uri.parse(value);
            String filePath = source.getPath();
            if (filePath == null) {
                call.reject("La ruta del APK no es válida");
                return;
            }
            File apk = new File(filePath);
            if (!apk.isFile() || apk.length() == 0) {
                call.reject("No se encontró un APK válido descargado");
                return;
            }
            if (Build.VERSION.SDK_INT >= 26 &&
                !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                JSObject result = new JSObject();
                result.put("needsPermission", true);
                call.resolve(result);
                return;
            }

            PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setSize(apk.length());
            int sessionId = installer.createSession(params);
            PackageInstaller.Session session = installer.openSession(sessionId);
            try (FileInputStream input = new FileInputStream(apk);
                 OutputStream output = session.openWrite("butterfly-cafe-update", 0, apk.length())) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                }
                session.fsync(output);
            }

            Intent callback = new Intent(getContext(), ApkInstallStatusReceiver.class);
            callback.setAction(getContext().getPackageName() + ".APK_INSTALL_STATUS");
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent statusIntent = PendingIntent.getBroadcast(
                getContext(), sessionId, callback, flags);
            session.commit(statusIntent.getIntentSender());
            session.close();

            JSObject result = new JSObject();
            result.put("needsPermission", false);
            result.put("installerOpened", true);
            result.put("method", "PackageInstaller.Session");
            call.resolve(result);
        } catch (Exception error) {
            String detail = error.getClass().getSimpleName() + ": " + error.getMessage();
            call.reject("PackageInstaller no pudo iniciar la instalación (" + detail + ")", error);
        }
    }
}

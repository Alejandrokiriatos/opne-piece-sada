package com.butterflycafe.admin;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

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
                Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                JSObject result = new JSObject();
                result.put("needsPermission", true);
                call.resolve(result);
                return;
            }

            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );

            // ACTION_VIEW es la ruta de compatibilidad más amplia para abrir
            // el instalador del sistema con un APK compartido mediante FileProvider.
            Intent installer = new Intent(Intent.ACTION_VIEW);
            installer.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installer.setClipData(ClipData.newRawUri("Butterfly Café update", apkUri));
            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            PackageManager pm = getContext().getPackageManager();
            if (installer.resolveActivity(pm) == null) {
                // Alternativa para dispositivos cuyo instalador solo expone esta acción.
                installer = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                installer.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installer.setClipData(ClipData.newRawUri("Butterfly Café update", apkUri));
                installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                installer.putExtra(Intent.EXTRA_RETURN_RESULT, true);
            }

            if (installer.resolveActivity(pm) == null) {
                call.reject("Android no encontró el instalador de aplicaciones");
                return;
            }

            getContext().startActivity(installer);

            JSObject result = new JSObject();
            result.put("needsPermission", false);
            result.put("installerOpened", true);
            call.resolve(result);
        } catch (Exception error) {
            String detail = error.getClass().getSimpleName() + ": " + error.getMessage();
            call.reject("No se pudo abrir el instalador de Android (" + detail + ")", error);
        }
    }
}

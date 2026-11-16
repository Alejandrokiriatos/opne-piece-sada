package com.butterflycafe.app;

import android.content.ClipData;
import android.content.Intent;
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
                call.reject("La ruta del APK no es válida: " + value);
                return;
            }

            File apk = new File(filePath);
            if (!apk.isFile() || apk.length() <= 0) {
                call.reject("El APK descargado no existe o está vacío: " + filePath);
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(settings);
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

            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            install.setClipData(ClipData.newUri(
                getContext().getContentResolver(), "APK de actualización", apkUri));

            if (getActivity() == null) {
                call.reject("No hay una pantalla activa para abrir el instalador de Android");
                return;
            }
            getActivity().startActivity(install);

            JSObject result = new JSObject();
            result.put("needsPermission", false);
            result.put("installerOpened", true);
            result.put("method", "ACTION_VIEW/FileProvider");
            call.resolve(result);
        } catch (Exception error) {
            String detail = error.getClass().getSimpleName() + ": " + error.getMessage();
            call.reject("No se pudo abrir el instalador Android (" + detail + ")", error);
        }
    }
}

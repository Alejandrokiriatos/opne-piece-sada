package com.butterflycafe.admin;

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
        if (value == null) {
            call.reject("Falta la ruta del APK");
            return;
        }
        Uri source = Uri.parse(value);
        File apk = new File(source.getPath());
        if (!apk.exists()) {
            call.reject("No se encontró el APK descargado");
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            JSObject result = new JSObject();
            result.put("needsPermission", true);
            call.resolve(result);
            return;
        }
        Uri apkUri = FileProvider.getUriForFile(getContext(),
            getContext().getPackageName() + ".fileprovider", apk);
        Intent installer = new Intent(Intent.ACTION_VIEW);
        installer.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(installer);
        JSObject result = new JSObject();
        result.put("needsPermission", false);
        call.resolve(result);
    }
}

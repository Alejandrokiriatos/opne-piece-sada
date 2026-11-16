package com.butterflycafe.admin;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.util.Log;
public class ApkInstallStatusReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context, Intent intent) {
  int status=intent.getIntExtra(PackageInstaller.EXTRA_STATUS,PackageInstaller.STATUS_FAILURE);
  String message=intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
  if(status==PackageInstaller.STATUS_PENDING_USER_ACTION){
   Intent confirmation=intent.getParcelableExtra(Intent.EXTRA_INTENT);
   if(confirmation!=null){confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);context.startActivity(confirmation);}
  } else if(status!=PackageInstaller.STATUS_SUCCESS){Log.e("ApkInstall","Install failed: "+status+" "+message);}
  else {Log.i("ApkInstall","APK installation succeeded");}
 }
}

const { withAndroidManifest, withDangerousMod, withMainApplication } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const STRINGS_XML = {
  values: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="keepalive_channel_name">nanobot keep-alive</string>
    <string name="keepalive_channel_desc">Keeps the connection active in background</string>
    <string name="keepalive_notification_text">nanobot connected</string>
</resources>
`,
  "values-it": `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="keepalive_channel_name">nanobot keep-alive</string>
    <string name="keepalive_channel_desc">Mantiene attiva la connessione in background</string>
    <string name="keepalive_notification_text">nanobot connesso</string>
</resources>
`,
};

const KEEP_ALIVE_SERVICE_KT = `package dev.nanobot.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class KeepAliveService : Service() {
    companion object {
        const val CHANNEL_ID = "keepalive"
        const val NOTIFICATION_ID = 9002
        @Volatile
        var isRunning: Boolean = false
            private set
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        isRunning = true
        // Not sticky: a restart without the JS runtime would show "connected" with no socket.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = getString(R.string.keepalive_channel_name)
            val channel = NotificationChannel(
                CHANNEL_ID,
                name,
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = getString(R.string.keepalive_channel_desc)
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent(this, MainActivity::class.java)
        launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val text = getString(R.string.keepalive_notification_text)

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationCompat.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            NotificationCompat.Builder(this)
        }

        return builder
            .setContentTitle("nanobot")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_nanobot_tile)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .build()
    }
}
`;

const KEEP_ALIVE_MODULE_KT = `package dev.nanobot.mobile

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class KeepAliveModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "KeepAlive"

    @ReactMethod
    fun start(promise: Promise) {
        try {
            val intent = Intent(reactContext, KeepAliveService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("START_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            val intent = Intent(reactContext, KeepAliveService::class.java)
            reactContext.stopService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(KeepAliveService.isRunning)
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                val isIgnoring = powerManager?.isIgnoringBatteryOptimizations(reactContext.packageName) ?: true
                promise.resolve(isIgnoring)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.resolve(true)
        }
    }
}
`;

const KEEP_ALIVE_PACKAGE_KT = `package dev.nanobot.mobile

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class KeepAlivePackage : ReactPackage {
    @Suppress("DEPRECATION")
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(KeepAliveModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

function modifyAndroidManifest(androidManifest) {
  const manifest = androidManifest?.manifest;
  if (!manifest) return androidManifest;

  manifest["uses-permission"] = manifest["uses-permission"] || [];
  const permissions = [
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING",
  ];
  for (const perm of permissions) {
    if (!manifest["uses-permission"].some((p) => p.$?.["android:name"] === perm)) {
      manifest["uses-permission"].push({
        $: { "android:name": perm },
      });
    }
  }

  const app = manifest.application?.[0];
  if (!app) return androidManifest;

  app.service = app.service || [];
  const hasService = app.service.some(
    (s) => s.$?.["android:name"] === ".KeepAliveService"
  );
  if (!hasService) {
    app.service.push({
      $: {
        "android:name": ".KeepAliveService",
        "android:enabled": "true",
        "android:exported": "false",
        "android:foregroundServiceType": "remoteMessaging",
      },
    });
  }

  return androidManifest;
}

function modifyMainApplication(contents) {
  if (contents.includes("KeepAlivePackage()")) {
    return contents;
  }
  if (contents.includes("// add(MyReactNativePackage())")) {
    return contents.replace(
      "// add(MyReactNativePackage())",
      "// add(MyReactNativePackage())\n          add(KeepAlivePackage())"
    );
  }
  if (contents.includes("PackageList(this).packages.apply {")) {
    return contents.replace(
      "PackageList(this).packages.apply {",
      "PackageList(this).packages.apply {\n          add(KeepAlivePackage())"
    );
  }
  return contents;
}

const withKeepAliveManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    config.modResults = modifyAndroidManifest(config.modResults);
    return config;
  });
};

const withKeepAliveMainApp = (config) => {
  return withMainApplication(config, (config) => {
    config.modResults.contents = modifyMainApplication(config.modResults.contents);
    return config;
  });
};

const withKeepAliveFiles = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const resDir = path.join(projectRoot, "app", "src", "main", "res");
      const javaDir = path.join(projectRoot, "app", "src", "main", "java", "dev", "nanobot", "mobile");

      for (const [dir, xml] of Object.entries(STRINGS_XML)) {
        fs.mkdirSync(path.join(resDir, dir), { recursive: true });
        fs.writeFileSync(path.join(resDir, dir, "keepalive_strings.xml"), xml);
      }

      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, "KeepAliveService.kt"), KEEP_ALIVE_SERVICE_KT);
      fs.writeFileSync(path.join(javaDir, "KeepAliveModule.kt"), KEEP_ALIVE_MODULE_KT);
      fs.writeFileSync(path.join(javaDir, "KeepAlivePackage.kt"), KEEP_ALIVE_PACKAGE_KT);

      return config;
    },
  ]);
};

function withKeepAlive(config) {
  return withKeepAliveFiles(withKeepAliveMainApp(withKeepAliveManifest(config)));
}

module.exports = withKeepAlive;
module.exports.modifyAndroidManifest = modifyAndroidManifest;
module.exports.modifyMainApplication = modifyMainApplication;

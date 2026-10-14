const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Ruling (2026-10-14 review): the widget is a launcher only, no connection status. Status written by the
// JS process goes stale as soon as Android kills the app, so the widget would show "Connected" forever.
const WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_container"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="12dp"
    android:background="@android:color/black">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="nanobot"
        android:textColor="@android:color/white"
        android:textSize="16sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_button"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:minHeight="48dp"
        android:gravity="center_vertical"
        android:text="@string/nanobot_new_chat"
        android:textColor="@android:color/white"
        android:textSize="14sp" />
</LinearLayout>
`;

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="140dp"
    android:minHeight="70dp"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/nanobot_widget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
`;

const STRINGS_XML = {
  values: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="nanobot_new_chat">+ New chat</string>
    <string name="nanobot_tile_label">nanobot chat</string>
</resources>
`,
  "values-it": `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="nanobot_new_chat">+ Nuova chat</string>
    <string name="nanobot_tile_label">Chat nanobot</string>
</resources>
`,
};

const TILE_ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M20,2H4C2.9,2 2,2.9 2,4v18l4,-4h14c1.1,0 2,-0.9 2,-2V4C22,2.9 21.1,2 20,2zM17,11h-4v4h-2v-4H7V9h4V5h2v4h4V11z" />
</vector>
`;

const WIDGET_PROVIDER_KT = `package dev.nanobot.mobile

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class NanobotWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nanobot://new-chat")).apply {
            setPackage(context.packageName)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        for (appWidgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.nanobot_widget).apply {
                setOnClickPendingIntent(R.id.widget_container, pendingIntent)
                setOnClickPendingIntent(R.id.widget_button, pendingIntent)
            }
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
`;

const TILE_SERVICE_KT = `package dev.nanobot.mobile

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class NanobotTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        qsTile?.let {
            it.state = Tile.STATE_INACTIVE
            it.updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        // unlockAndRun: never open the app over the lock screen.
        unlockAndRun { openNewChat() }
    }

    private fun openNewChat() {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nanobot://new-chat")).apply {
            setPackage(packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val pendingIntent = PendingIntent.getActivity(
                this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            startActivityAndCollapse(pendingIntent)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
`;

function modifyAndroidManifest(androidManifest) {
  const app = androidManifest?.manifest?.application?.[0];
  if (!app) return androidManifest;

  app.receiver = app.receiver || [];
  const hasWidget = app.receiver.some(
    (r) => r.$?.["android:name"] === ".NanobotWidgetProvider"
  );
  if (!hasWidget) {
    app.receiver.push({
      $: {
        "android:name": ".NanobotWidgetProvider",
        "android:exported": "true",
      },
      "intent-filter": [
        {
          action: [
            {
              $: {
                "android:name": "android.appwidget.action.APPWIDGET_UPDATE",
              },
            },
          ],
        },
      ],
      "meta-data": [
        {
          $: {
            "android:name": "android.appwidget.provider",
            "android:resource": "@xml/nanobot_widget_info",
          },
        },
      ],
    });
  }

  app.service = app.service || [];
  const hasTile = app.service.some(
    (s) => s.$?.["android:name"] === ".NanobotTileService"
  );
  if (!hasTile) {
    app.service.push({
      $: {
        "android:name": ".NanobotTileService",
        "android:label": "@string/nanobot_tile_label",
        "android:icon": "@drawable/ic_nanobot_tile",
        "android:permission": "android.permission.BIND_QUICK_SETTINGS_TILE",
        "android:exported": "true",
      },
      "intent-filter": [
        {
          action: [
            {
              $: {
                "android:name": "android.service.quicksettings.action.QS_TILE",
              },
            },
          ],
        },
      ],
    });
  }

  return androidManifest;
}

const withWidgetManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    config.modResults = modifyAndroidManifest(config.modResults);
    return config;
  });
};

const withWidgetFiles = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const resDir = path.join(projectRoot, "app", "src", "main", "res");
      const javaDir = path.join(projectRoot, "app", "src", "main", "java", "dev", "nanobot", "mobile");

      // res/layout/nanobot_widget.xml
      const layoutDir = path.join(resDir, "layout");
      fs.mkdirSync(layoutDir, { recursive: true });
      fs.writeFileSync(path.join(layoutDir, "nanobot_widget.xml"), WIDGET_LAYOUT_XML);

      // res/xml/nanobot_widget_info.xml
      const xmlDir = path.join(resDir, "xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "nanobot_widget_info.xml"), WIDGET_INFO_XML);

      for (const [dir, xml] of Object.entries(STRINGS_XML)) {
        fs.mkdirSync(path.join(resDir, dir), { recursive: true });
        fs.writeFileSync(path.join(resDir, dir, "nanobot_widget_strings.xml"), xml);
      }
      const drawableDir = path.join(resDir, "drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(path.join(drawableDir, "ic_nanobot_tile.xml"), TILE_ICON_XML);

      // Kotlin source files
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, "NanobotWidgetProvider.kt"), WIDGET_PROVIDER_KT);
      fs.writeFileSync(path.join(javaDir, "NanobotTileService.kt"), TILE_SERVICE_KT);

      return config;
    },
  ]);
};

function withNanobotWidget(config) {
  return withWidgetFiles(withWidgetManifest(config));
}

module.exports = withNanobotWidget;
module.exports.modifyAndroidManifest = modifyAndroidManifest;

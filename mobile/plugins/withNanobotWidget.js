const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_container"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="12dp"
    android:background="@android:color/black">

    <TextView
        android:id="@+id/widget_title"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="nanobot"
        android:textColor="@android:color/white"
        android:textSize="16sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_status"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:text="Non connesso"
        android:textColor="@android:color/darker_gray"
        android:textSize="13sp" />

    <Button
        android:id="@+id/widget_button"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:text="+ New Chat"
        android:textSize="12sp" />
</LinearLayout>
`;

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="140dp"
    android:minHeight="70dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/nanobot_widget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
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
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs = context.getSharedPreferences("nanobot_widget_prefs", Context.MODE_PRIVATE)
            val profileName = prefs.getString("profileName", "nanobot") ?: "nanobot"
            val state = prefs.getString("state", "none") ?: "none"

            val statusText = when (state) {
                "open" -> "Connesso"
                "connecting" -> "Connessione..."
                "offline" -> "Non connesso"
                else -> "Nessun profilo"
            }

            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nanobot://new-chat")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pendingIntent = PendingIntent.getActivity(context, 0, intent, flags)

            val views = RemoteViews(context.packageName, R.layout.nanobot_widget).apply {
                setTextViewText(R.id.widget_title, profileName)
                setTextViewText(R.id.widget_status, statusText)
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
import android.service.quicksettings.TileService

class NanobotTileService : TileService() {
    override fun onClick() {
        super.onClick()
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nanobot://new-chat")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
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
        "android:label": "Nuova chat nanobot",
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

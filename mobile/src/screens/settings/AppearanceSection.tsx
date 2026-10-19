import React, { useEffect, useState } from "react";
import { useStore } from "zustand";
import { speechStore } from "../../extras/speech";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useT } from "../../i18n";
import { lockSettings } from "../../extras/lock";
import { prefs, type Language, type VoiceEngine } from "../../settings/prefs";
import * as IntentLauncher from "expo-intent-launcher";
import { keepAlive } from "../../platform/keepAlive";
import { isOfflineLocaleInstalled } from "../../extras/sttEngine";
import { Button, ListItem, toast } from "../../ui/components";
import { useThemePreference, useTheme, type ThemePref } from "../../ui/ThemeProvider";
import { Chips, Head } from "./common";

const THEMES: ThemePref[] = ["system", "light", "dark"];
const LANGS: Language[] = ["system", "it", "en"];

export function AppearanceSection() {
  const t = useT();
  const th = useTheme();
  const [pref, setPref] = useThemePreference();
  const [lock, setLock] = useState(lockSettings.enabled());
  const [lang, setLang] = useState<Language>(prefs.language());
  const [sound, setSound] = useState(prefs.notificationSound());
  const [kanbanNotify, setKanbanNotify] = useState(prefs.kanbanNotifications());
  const [backgroundConn, setBackgroundConn] = useState(prefs.backgroundConnection());
  const [isIgnoringBattery, setIsIgnoringBattery] = useState<boolean | null>(null);
  const [voiceAutoRead, setVoiceAutoRead] = useState(prefs.voiceAutoRead?.() ?? false);
  const [voiceEngine, setVoiceEngineState] = useState<VoiceEngine>(prefs.voiceEngine?.() ?? "device");
  const [offlineReady, setOfflineReady] = useState<boolean | null>(null);
  const audioOn = useStore(speechStore, (s) => s.enabled);

  useEffect(() => {
    if (Platform.OS !== "web") {
      void isOfflineLocaleInstalled().then((ready) => setOfflineReady(ready));
    }
  }, []);

  useEffect(() => {
    // true off Android, so the exemption button only ever shows there.
    void keepAlive.isIgnoringBatteryOptimizations().then(setIsIgnoringBattery);
  }, [backgroundConn]);

  const onLock = async (v: boolean) => {
    if (v) {
      const r = await lockSettings.setEnabled(true);
      if (r.ok) setLock(true);
      else toast.show(t(`settings.${r.reason ?? "no_hardware"}`));
      return;
    }
    const a = await LocalAuthentication.authenticateAsync({ promptMessage: t("settings.unlockReason") });
    if (!a.success) return;
    await lockSettings.setEnabled(false);
    setLock(false);
  };

  return (
    <>
      <Head>{t("settings.theme")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, padding: 12, paddingBottom: 0 }}>
        <Chips
          options={THEMES.map((p) => ({ value: p, label: t(`settings.${p}`) }))}
          value={pref}
          onChange={setPref}
        />
      </View>

      <Head>{t("settings.language")}</Head>
      <View style={{ ...th.surface, marginHorizontal: 16, padding: 12, paddingBottom: 0 }}>
        <Chips
          options={LANGS.map((l) => ({ value: l, label: l === "system" ? t("settings.system") : l.toUpperCase() }))}
          value={lang}
          onChange={(l) => {
            prefs.setLanguage(l);
            setLang(l);
          }}
        />
      </View>

      <View style={{ ...th.surface, marginHorizontal: 16, marginTop: 16, overflow: "hidden" }}>
        <ListItem
          title={t("settings.sound")}
          subtitle={t("settings.soundHelp")}
          right={
            <Switch
              accessibilityLabel={t("settings.sound")}
              value={sound}
              onValueChange={(v) => {
                prefs.setNotificationSound(v);
                setSound(v);
              }}
            />
          }
        />
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("settings.kanbanNotifications")}
            subtitle={t("settings.kanbanNotificationsHelp")}
            right={
              <Switch
                accessibilityLabel={t("settings.kanbanNotifications")}
                value={kanbanNotify}
                onValueChange={(v) => {
                  prefs.setKanbanNotifications(v);
                  setKanbanNotify(v);
                }}
              />
            }
          />
        </View>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("settings.backgroundConnection")}
            subtitle={t("settings.backgroundConnectionHelp")}
            right={
              <Switch
                accessibilityLabel={t("settings.backgroundConnection")}
                value={backgroundConn}
                onValueChange={(v) => {
                  prefs.setBackgroundConnection(v);
                  setBackgroundConn(v);
                }}
              />
            }
          />
          {backgroundConn && isIgnoringBattery === false ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <Button
                variant="secondary"
                title={t("settings.exemptBatteryOptimization")}
                onPress={() => {
                  void IntentLauncher.startActivityAsync(
                    IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
                  ).catch(() => {});
                }}
              />
            </View>
          ) : null}
        </View>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("settings.audioReplies")}
            subtitle={t("settings.audioRepliesHelp")}
            right={
              <Switch
                accessibilityLabel={t("settings.audioReplies")}
                value={audioOn}
                onValueChange={(v) => speechStore.getState().setEnabled(v)}
              />
            }
          />
        </View>
        {Platform.OS !== "web" ? (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border, paddingBottom: 8 }}>
            <ListItem
              title={t("settings.voiceEngine")}
              subtitle={
                offlineReady === null
                  ? undefined
                  : offlineReady
                  ? t("voice.offlineReady")
                  : t("voice.offlineMissing")
              }
            />
            <View style={{ paddingHorizontal: 16 }}>
              <Chips
                options={[
                  { value: "device", label: t("voice.engineDevice") },
                  { value: "server", label: t("voice.engineServer") },
                ]}
                value={voiceEngine}
                onChange={(v) => {
                  prefs.setVoiceEngine?.(v);
                  setVoiceEngineState(v);
                }}
              />
            </View>
            <Text style={{ fontFamily: th.font.regular, fontSize: 13, color: th.colors.mutedForeground, paddingHorizontal: 16, paddingBottom: 4 }}>
              {t("voice.offlineHint")}
            </Text>
          </View>
        ) : null}
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("settings.voiceAutoRead")}
            subtitle={t("settings.voiceAutoReadHelp")}
            right={
              <Switch
                accessibilityLabel={t("settings.voiceAutoRead")}
                value={audioOn && voiceAutoRead}
                disabled={!audioOn}
                onValueChange={(v) => {
                  prefs.setVoiceAutoRead?.(v);
                  setVoiceAutoRead(v);
                }}
              />
            }
          />
        </View>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border }}>
          <ListItem
            title={t("settings.lock")}
            subtitle={t("settings.lockHelp")}
            right={<Switch accessibilityLabel={t("settings.lock")} value={lock} onValueChange={onLock} />}
          />
        </View>
      </View>
    </>
  );
}

export const AppSection = AppearanceSection;

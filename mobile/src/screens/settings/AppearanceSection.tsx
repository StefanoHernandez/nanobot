import React, { useState } from "react";
import { useStore } from "zustand";
import { speechStore } from "../../extras/speech";
import { Switch, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useT } from "../../i18n";
import { lockSettings } from "../../extras/lock";
import { prefs, type Language } from "../../settings/prefs";
import { Button, ListItem, toast } from "../../ui/components";
import { useThemePreference, type ThemePref } from "../../ui/ThemeProvider";
import { Head } from "./common";

const THEMES: ThemePref[] = ["system", "light", "dark"];
const LANGS: Language[] = ["system", "it", "en"];
const row = { flexDirection: "row", gap: 8, paddingHorizontal: 16 } as const;

export function AppearanceSection() {
  const t = useT();
  const [pref, setPref] = useThemePreference();
  const [lock, setLock] = useState(lockSettings.enabled());
  const [lang, setLang] = useState<Language>(prefs.language());
  const [sound, setSound] = useState(prefs.notificationSound());
  const [voiceAutoRead, setVoiceAutoRead] = useState(prefs.voiceAutoRead?.() ?? false);
  const audioOn = useStore(speechStore, (s) => s.enabled);

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
      <View style={row}>
        {THEMES.map((p) => (
          <Button key={p} title={t(`settings.${p}`)} variant={pref === p ? "primary" : "secondary"} onPress={() => setPref(p)} />
        ))}
      </View>
      <Head>{t("settings.language")}</Head>
      <View style={row}>
        {LANGS.map((l) => (
          <Button
            key={l}
            title={l === "system" ? t("settings.system") : l.toUpperCase()}
            variant={lang === l ? "primary" : "secondary"}
            onPress={() => {
              prefs.setLanguage(l);
              setLang(l);
            }}
          />
        ))}
      </View>
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
      <ListItem
        title={t("settings.lock")}
        subtitle={t("settings.lockHelp")}
        right={<Switch accessibilityLabel={t("settings.lock")} value={lock} onValueChange={onLock} />}
      />
    </>
  );
}

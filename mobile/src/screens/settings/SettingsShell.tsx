import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../i18n";
import { useRestart, useSettings } from "../../settings/store";
import { Button, Dialog, IconButton } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

/** Header, global restart notice and (on the root list only) the leave-with-restart-pending guard. */
export function SettingsShell({ title, onBack, guard, children }: { title: string; onBack: () => void; guard?: boolean; children: React.ReactNode }) {
  const t = useT();
  const th = useTheme();
  const nav = useNavigation();
  const { pending, state, run } = useRestart();
  const { data, loading, error, refresh } = useSettings();
  const allowLeave = useRef(false);
  const [leave, setLeave] = useState<{ go: () => void } | null>(null);

  useEffect(() => {
    if (!data) void refresh();
  }, [data, refresh]);

  useEffect(() => {
    const unsub = nav?.addListener?.("focus", () => {
      void refresh();
    });
    return () => unsub?.();
  }, [refresh, nav]);

  useEffect(() => {
    if (!guard || !pending) return;
    return nav.addListener("beforeRemove", (e: { preventDefault(): void; data: { action: unknown } }) => {
      if (allowLeave.current) return;
      e.preventDefault();
      setLeave({ go: () => {
          allowLeave.current = true;
          nav.dispatch(e.data.action as never);
        },
      });
    });
  }, [guard, pending, nav]);

  const busy = state === "restarting";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: th.colors.border }}>
        <IconButton icon="arrow-left" accessibilityLabel={t("settings.back")} onPress={onBack} />
        <Text style={{ color: th.colors.foreground, fontSize: 18 }}>{title}</Text>
      </View>
      {error ? (
        <View style={{ backgroundColor: th.colors.card, borderColor: th.colors.destructive, borderWidth: 1, padding: 12, margin: 16, borderRadius: th.radius.md, gap: 8 }}>
          <Text style={{ color: th.colors.destructive, fontSize: 14 }}>{error}</Text>
          <Button title={t("common.retry")} onPress={() => void refresh()} loading={loading} variant="secondary" />
        </View>
      ) : null}
      {pending || state !== "idle" ? (
        <View style={{ backgroundColor: th.colors.accent, padding: 12, gap: 8 }}>
          <Text style={{ color: th.colors.accentForeground, fontSize: 14 }}>
            {state === "restarting" ? t("settings.restarting") : state === "timeout" ? t("settings.restartTimeout") : state === "done" && !pending ? t("settings.restartDone") : t("settings.restartNotice")}
          </Text>
          {pending || state === "timeout" ? <Button title={t("settings.restart")} onPress={() => void run()} loading={busy} variant="secondary" /> : null}
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>{children}</ScrollView>
      <Dialog
        open={!!leave}
        title={t("settings.leaveTitle")}
        message={t("settings.leaveMessage")}
        confirmLabel={t("settings.leave")}
        cancelLabel={t("settings.stay")}
        onCancel={() => setLeave(null)}
        onConfirm={() => {
          const l = leave;
          setLeave(null);
          l?.go();
        }}
      />
    </SafeAreaView>
  );
}

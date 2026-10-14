import React, { useState } from "react";
import { Switch, View } from "react-native";
import { useT } from "../../i18n";
import { isDangerousAccessMode } from "../../settings/runtimeFields";
import { networkSafetyPayload } from "../../settings/capabilities";
import { useSettings } from "../../settings/store";
import { Dialog, ListItem, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { Chips, Head } from "./common";

/** Placed on the Advanced page by P3-U4. */
export function NetworkSafetyCard() {
  const t = useT();
  const th = useTheme();
  const { data, mutate } = useSettings();
  const [confirming, setConfirming] = useState(false);
  const [confirmingLocal, setConfirmingLocal] = useState(false);
  if (!data) return null;
  const a = data.advanced;
  const save = async (local: boolean, mode: "default" | "full") => {
    try {
      await mutate("settings.network_safety.update", networkSafetyPayload({ webuiAllowLocalServiceAccess: local, webuiDefaultAccessMode: mode }));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e));
    }
  };
  const mode = a.webui_default_access_mode === "full" ? "full" : "default";
  return (
    <>
      <Head>{t("netsafe.title")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden" }}>
        <ListItem
          title={t("netsafe.local")} subtitle={t("netsafe.localHelp")}
          right={<Switch accessibilityLabel={t("netsafe.local")} value={a.webui_allow_local_service_access} onValueChange={(v) => (v ? setConfirmingLocal(true) : void save(false, mode))} />}
        />
      </View>
      <Head>{t("netsafe.mode")}</Head>
      <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, padding: 12 }}>
        <Chips
          options={[{ value: "default", label: t("netsafe.default") }, { value: "full", label: t("netsafe.full") }]} value={mode}
          onChange={(m) => (m === mode ? undefined : isDangerousAccessMode(m) ? setConfirming(true) : void save(a.webui_allow_local_service_access, m))}
        />
      </View>
      <Dialog
        open={confirming} destructive title={t("netsafe.confirmTitle")} message={t("netsafe.confirmMessage")}
        confirmLabel={t("netsafe.confirm")} cancelLabel={t("common.cancel")}
        onCancel={() => setConfirming(false)} onConfirm={() => (setConfirming(false), void save(a.webui_allow_local_service_access, "full"))}
      />
      <Dialog
        open={confirmingLocal} destructive title={t("netsafe.confirmLocalTitle")} message={t("netsafe.confirmLocalMessage")}
        confirmLabel={t("netsafe.confirmLocal")} cancelLabel={t("common.cancel")}
        onCancel={() => setConfirmingLocal(false)} onConfirm={() => (setConfirmingLocal(false), void save(true, mode))}
      />
    </>
  );
}

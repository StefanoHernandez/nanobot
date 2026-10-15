import React, { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { useStore } from "zustand";
import { useTheme } from "../../ui/ThemeProvider";
import { useT } from "../../i18n";
import { Button, Dialog, ListItem, toast } from "../../ui/components";
import { approvalsStore, setApprovalsEnabled, forgetApproval, chatLabelFor } from "../../extras/approvals";
import { chatsStore } from "../../state/chatsStore";
import { sessionStore } from "../../state/sessionStore";
import { Head } from "./common";

export function ApprovalsCard() {
  const t = useT();
  const th = useTheme();
  const enabled = useStore(approvalsStore, (s) => s.enabled);
  const allow = useStore(approvalsStore, (s) => s.allow);
  const chats = useStore(chatsStore, (s) => s.chats);
  const session = useStore(sessionStore, (s) => s.session);

  const [forgetKey, setForgetKey] = useState<string | null>(null);

  const handleToggle = async (val: boolean) => {
    if (!session) return;
    approvalsStore.getState().setEnabled(val);
    try {
      await setApprovalsEnabled(session, val);
    } catch (err) {
      approvalsStore.getState().setEnabled(!val);
      toast.show(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmForget = async () => {
    if (!session || !forgetKey) return;
    const key = forgetKey;
    setForgetKey(null);
    try {
      await forgetApproval(session, key);
      approvalsStore.getState().removeAllow(key);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    }
  };

  const allowedEntries = Object.entries(allow ?? {}).filter(
    ([, tools]) => Array.isArray(tools) && tools.includes("exec"),
  );

  return (
    <>
      <Head>{t("approvals.security")}</Head>
      <View
        style={{
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
          marginHorizontal: 16,
          overflow: "hidden",
        }}
      >
        <ListItem
          title={t("approvals.enable")}
          subtitle={t("approvals.enableHelp")}
          right={
            <Switch
              accessibilityLabel={t("approvals.enable")}
              value={enabled}
              onValueChange={(val) => void handleToggle(val)}
            />
          }
        />
      </View>

      {allowedEntries.length > 0 && (
        <>
          <Head>{t("approvals.alwaysAllowedTitle")}</Head>
          <View
            style={{
              backgroundColor: th.colors.card,
              borderRadius: th.radius.md,
              marginHorizontal: 16,
              overflow: "hidden",
            }}
          >
            {allowedEntries.map(([key], index) => {
              const label = chatLabelFor(key, chats, t);
              return (
                <View
                  key={key}
                  style={
                    index > 0
                      ? {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: th.colors.border,
                        }
                      : undefined
                  }
                >
                  <ListItem
                    title={label}
                    right={
                      <Button
                        title={t("approvals.remove")}
                        variant="ghost"
                        color={th.colors.destructive}
                        onPress={() => setForgetKey(key)}
                      />
                    }
                  />
                </View>
              );
            })}
          </View>
        </>
      )}

      <Dialog
        open={!!forgetKey}
        title={t("approvals.forgetConfirmTitle")}
        message={t("approvals.forgetConfirmMessage")}
        confirmLabel={t("approvals.confirm")}
        cancelLabel={t("common.cancel")}
        destructive
        onCancel={() => setForgetKey(null)}
        onConfirm={() => void handleConfirmForget()}
      />
    </>
  );
}

import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useT } from "../../i18n";
import { subagentsAvailable, useSubagents } from "../../state/subagentsStore";
import { useSession } from "../../state/sessionStore";
import { Button, Dialog, IconButton, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import type { SubagentTaskSnapshot } from "@/lib/types";

const ACTIVE = ["queued", "running", "stopping"];
export const isActive = (s: string) => ACTIVE.includes(s);

export function useStateColor() {
  const { colors } = useTheme();
  return (s: string) => (s === "error" ? colors.destructive : isActive(s) ? colors.primary : colors.mutedForeground);
}

export const SubagentChip = ({ state }: { state: string }) => {
  const t = useT();
  const color = useStateColor()(state);
  return (
    <View style={{ borderWidth: 1, borderColor: color, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: 12 }}>{t(`subagents.state.${state}`, { defaultValue: state })}</Text>
    </View>
  );
};

const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

/** Header badge + the sheet it opens; renders nothing without tasks. */
export function SubagentsButton({
  chatKey,
  trigger = true,
  open: openProp,
  onOpenChange,
}: {
  chatKey: string;
  trigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const { tasks, cancel } = useSubagents(chatKey);
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp === undefined) setInner(next);
  };
  const [pending, setPending] = useState<string | null>(null);
  if (!subagentsAvailable(session, chatKey) || tasks.length === 0) return null;
  const active = tasks.filter((x) => isActive(x.state)).length;
  const sorted = [...tasks].sort((a: SubagentTaskSnapshot, b: SubagentTaskSnapshot) => b.created_at - a.created_at);
  return (
    <View>
      {trigger ? <IconButton icon="robot-outline" accessibilityLabel={t("subagents.open")} onPress={() => setOpen(true)} /> : null}
      {trigger && active > 0 ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: th.colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
          <Text style={{ color: th.colors.primaryForeground, fontSize: 10 }}>{active}</Text>
        </View>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={t("subagents.title")}>
        <ScrollView style={{ maxHeight: 420 }}>
          {sorted.map((x) => (
            <View key={x.task_id} style={{ flexDirection: "row", alignItems: "center", minHeight: 56, gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                style={{ flex: 1, minHeight: 48, justifyContent: "center" }}
                onPress={() => { setOpen(false); router.push(`/subagent/${encodeURIComponent(chatKey)}/${encodeURIComponent(x.task_id)}` as never); }}
              >
                <Text numberOfLines={1} style={{ color: th.colors.popoverForeground, fontFamily: th.font.regular, fontSize: 15 }}>{x.label || x.task_description}</Text>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 2 }}>
                  <SubagentChip state={x.state} />
                  {x.elapsed_seconds != null ? <Text style={{ color: th.colors.mutedForeground, fontSize: 12 }}>{secs(x.elapsed_seconds)}</Text> : null}
                </View>
              </Pressable>
              {isActive(x.state) ? <Button title={t("subagents.cancelTask")} variant="ghost" onPress={() => setPending(x.task_id)} /> : null}
            </View>
          ))}
        </ScrollView>
      </Sheet>
      <Dialog
        open={pending != null}
        title={t("subagents.confirmTitle")}
        confirmLabel={t("subagents.confirm")}
        cancelLabel={t("subagents.back")}
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => { const id = pending; setPending(null); if (id) void Promise.resolve(cancel(id)).catch(() => toast.show(t("subagents.cancelFailed"))); }}
      />
    </View>
  );
}

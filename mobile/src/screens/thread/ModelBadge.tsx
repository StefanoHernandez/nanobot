import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { Preset } from "../../extras/effort";
import { basePresetName } from "../../extras/logic";
import { useT } from "../../i18n";
import { chatIdOf, isWritable } from "../../state/chatsStore";
import { useSession } from "../../state/sessionStore";
import { ListItem, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

/** Presets the user picks from: base presets only (effort-derived "name·level" ones belong to the effort pill). */
export const pickablePresets = (presets: Preset[]) => presets.filter((p) => basePresetName(p.name) === p.name);

/** Header badge; in a writable chat, tap opens the preset list and sends `/model <name>`, as the WebUI does. */
export function ModelBadge({ chatKey, preset, model }: { chatKey: string; preset: string | null; model: string | null }) {
  const th = useTheme();
  const t = useT();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const name = preset ?? model;
  const canPick = !!session && isWritable(chatKey);

  const show = async () => {
    if (!session) return;
    setOpen(true);
    setPresets(null);
    try {
      const s = await session.get<{ model_presets?: Preset[] }>("/api/settings");
      setPresets(pickablePresets(s.model_presets ?? []));
    } catch (e) {
      setOpen(false);
      toast.show(e instanceof Error ? e.message : String(e));
    }
  };

  const pick = (p: Preset) => {
    setOpen(false);
    if (!session || basePresetName(preset ?? "") === p.name) return;
    session.client.sendMessage(chatIdOf(chatKey), `/model ${p.name}`);
  };

  if (!name && !canPick) return null;
  const current = basePresetName(preset ?? "");
  return (
    <>
      <Pressable
        disabled={!canPick}
        onPress={() => void show()}
        accessibilityRole={canPick ? "button" : undefined}
        accessibilityLabel={t("thread.changeModel")}
        hitSlop={8}
        style={{ minHeight: 48, justifyContent: "center", alignSelf: "flex-start" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: th.colors.muted, borderRadius: th.radius.sm, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 180 }}>
          <Text numberOfLines={1} style={{ color: th.colors.foreground, fontSize: 12, flexShrink: 1 }}>{name ?? t("thread.chooseModel")}</Text>
          {canPick ? <Text style={{ color: th.colors.mutedForeground, fontSize: 10, marginLeft: 4 }}>▼</Text> : null}
        </View>
      </Pressable>
      {open ? (
        <Sheet open={open} onClose={() => setOpen(false)} title={t("thread.chooseModel")}>
          {presets === null ? (
            <ActivityIndicator color={th.colors.foreground} style={{ margin: 24 }} />
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {presets.map((p) => (
                <ListItem
                  key={p.name}
                  title={p.name}
                  subtitle={`${p.provider} · ${p.model}`}
                  onPress={() => pick(p)}
                  right={p.name === current ? <Text style={{ color: th.colors.primary, fontSize: 16 }}>✓</Text> : undefined}
                />
              ))}
            </ScrollView>
          )}
        </Sheet>
      ) : null}
    </>
  );
}

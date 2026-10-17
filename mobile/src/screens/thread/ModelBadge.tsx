import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { Preset } from "../../extras/effort";
import { basePresetName } from "../../extras/logic";
import { useT } from "../../i18n";
import { chatIdOf, isWritable } from "../../state/chatsStore";
import { useSession } from "../../state/sessionStore";
import type { NanobotSession } from "../../core/session";
import { ListItem, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

/** Presets the user picks from: base presets only (effort-derived "name·level" ones belong to the effort pill). */
export const pickablePresets = (presets: Preset[]) => presets.filter((p) => basePresetName(p.name) === p.name);

/** Resolve the chat's model preset from session's model_preset, active preset, or default preset. */
export async function resolveChatModelPreset(session: NanobotSession, sessionKey: string): Promise<string | null> {
  const [settings, sess] = await Promise.all([
    session.get<{ model_presets?: Preset[] }>("/api/settings").catch(() => ({ model_presets: [] })),
    session.get<{ sessions?: Array<{ key: string; model_preset?: string | null }> }>("/api/sessions").catch(() => ({ sessions: [] })),
  ]);
  const presets = settings.model_presets ?? [];
  const row = (sess.sessions ?? []).find((s) => s.key === sessionKey);
  const matched =
    (row?.model_preset ? presets.find((p) => p.name === row.model_preset) : undefined) ??
    presets.find((p) => p.active) ??
    presets.find((p) => p.is_default);
  return matched?.name ?? null;
}

/** Header badge; in a writable chat, tap opens the preset list and sends `/model <name>`, as the WebUI does. */
export function ModelBadge({ chatKey, preset, model }: { chatKey: string; preset: string | null; model: string | null }) {
  const th = useTheme();
  const t = useT();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      resolveChatModelPreset(session, chatKey)
        .then((res) => {
          if (!cancelled) setResolved(res);
        })
        .catch(() => {
          if (!cancelled) setResolved(null);
        });
    };
    load();
    const unsub = session.client?.onRuntimeModelUpdate?.(() => load());
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [session, chatKey]);

  const name = preset ?? model ?? resolved;
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
    if (!session || basePresetName(preset ?? resolved ?? "") === p.name) return;
    session.client.sendMessage(chatIdOf(chatKey), `/model ${p.name}`);
  };

  if (!name && !canPick) return null;
  const current = basePresetName(preset ?? resolved ?? "");
  return (
    <>
      <Pressable
        disabled={!canPick}
        onPress={() => void show()}
        accessibilityRole={canPick ? "button" : undefined}
        accessibilityLabel={t("thread.changeModel")}
        hitSlop={12}
        style={{ alignSelf: "flex-start", flexShrink: 1 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: th.colors.card, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, maxWidth: 170 }}>
          <Text numberOfLines={1} style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 12, flexShrink: 1 }}>{name ?? t("thread.chooseModel")}</Text>
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

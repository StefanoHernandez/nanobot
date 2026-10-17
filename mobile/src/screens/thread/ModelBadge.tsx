import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { Preset } from "../../extras/effort";
import { basePresetName } from "../../extras/logic";
import { useT } from "../../i18n";
import { chatIdOf, isWritable } from "../../state/chatsStore";
import { useSession } from "../../state/sessionStore";
import type { NanobotSession } from "../../core/session";
import { activePresetNames } from "../../settings/models";
import { ListItem, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

/** Presets the user picks from: base presets in call order (disabled ones hidden, unless currently selected by the chat). */
export function pickablePresets(
  presets: Preset[],
  settings?: { model_call_order?: string[]; model_presets?: Preset[] } | string[] | null,
  currentPreset?: string | null,
): Preset[] {
  const baseOnly = presets.filter((p) => basePresetName(p.name) === p.name);
  if (settings === undefined) return baseOnly;
  const active = activePresetNames(settings);
  const curBase = currentPreset ? basePresetName(currentPreset) : null;
  const order = Array.isArray(settings)
    ? settings
    : settings?.model_call_order ?? baseOnly.map((p) => p.name);
  const byName = new Map(baseOnly.map((p) => [p.name, p]));
  const seen = new Set<string>();
  const result: Preset[] = [];
  for (const name of order) {
    const p = byName.get(name);
    if (p && active.has(name) && !seen.has(name)) {
      seen.add(name);
      result.push(p);
    }
  }
  if (curBase && !active.has(curBase) && !seen.has(curBase)) {
    const curPreset = byName.get(curBase);
    if (curPreset) {
      seen.add(curBase);
      result.push(curPreset);
    }
  }
  return result;
}

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
  const [activeNames, setActiveNames] = useState<Set<string>>(() => new Set());
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
      const s = await session.get<{ model_presets?: Preset[]; model_call_order?: string[] }>("/api/settings");
      const active = activePresetNames(s);
      setActiveNames(active);
      const cur = preset ?? model ?? resolved;
      setPresets(pickablePresets(s.model_presets ?? [], s, cur));
    } catch (e) {
      setOpen(false);
      toast.show(e instanceof Error ? e.message : String(e));
    }
  };

  const pick = (p: Preset) => {
    setOpen(false);
    if (!session || basePresetName(preset ?? model ?? resolved ?? "") === p.name) return;
    session.client.sendMessage(chatIdOf(chatKey), `/model ${p.name}`);
  };

  if (!name && !canPick) return null;
  const current = basePresetName(preset ?? model ?? resolved ?? "");
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
              {presets.map((p) => {
                const isActive = activeNames.has(p.name);
                const title = isActive ? p.name : `${p.name} (${t("models.disabledTag")})`;
                return (
                  <ListItem
                    key={p.name}
                    title={title}
                    subtitle={`${p.provider} · ${p.model}`}
                    onPress={() => pick(p)}
                    right={p.name === current ? <Text style={{ color: th.colors.primary, fontSize: 16 }}>✓</Text> : undefined}
                  />
                );
              })}
            </ScrollView>
          )}
        </Sheet>
      ) : null}
    </>
  );
}

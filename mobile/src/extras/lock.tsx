import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { AppState, Keyboard, StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { createStore, useStore } from "zustand";
import { useT } from "../i18n";
import { kv } from "../platform/storage";
import { Button } from "../ui/components";
import { useTheme } from "../ui/ThemeProvider";
import { BotFace } from "../ui/BotFace";

const KEY = "lock.enabled";
const RELOCK_MS = 300_000;

/** True after > 5 min in background, and on cold start (no background timestamp yet). */
export const isRelockDue = (lastBackgroundAt: number | null, now: number): boolean =>
  lastBackgroundAt === null || now - lastBackgroundAt > RELOCK_MS;

export const lockStore = createStore<{ enabled: boolean; locked: boolean }>(() => {
  const enabled = kv.get(KEY) === "1";
  return { enabled, locked: enabled }; // cold start with lock on -> locked
});

export const lockSettings = {
  enabled: (): boolean => kv.get(KEY) === "1",
  async setEnabled(v: boolean): Promise<{ ok: boolean; reason?: "no_hardware" | "not_enrolled" }> {
    if (v) {
      if (!(await LocalAuthentication.hasHardwareAsync())) return { ok: false, reason: "no_hardware" };
      if (!(await LocalAuthentication.isEnrolledAsync())) return { ok: false, reason: "not_enrolled" };
      kv.set(KEY, "1");
    } else kv.del(KEY);
    lockStore.setState({ enabled: v, locked: false }); // the user is present right now
    return { ok: true };
  },
};

export function LockGate({ children }: { children: ReactNode }) {
  const t = useT();
  const th = useTheme();
  const { enabled, locked } = useStore(lockStore);
  const lastBg = useRef<number | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    void (enabled ? preventScreenCaptureAsync() : allowScreenCaptureAsync());
  }, [enabled]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") lastBg.current = Date.now();
      else if (s === "active" && lockStore.getState().enabled && lastBg.current !== null && isRelockDue(lastBg.current, Date.now()))
        lockStore.setState({ locked: true });
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // Hardware/enrollment gone since enabling -> lock is skipped rather than locking the user out.
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
        lockStore.setState({ locked: false });
        return;
      }
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: t("extras.unlockPrompt") });
      if (r.success) lockStore.setState({ locked: false });
    } finally {
      busy.current = false;
    }
  }, [t]);

  const show = enabled && locked;
  useEffect(() => {
    if (!show) return;
    Keyboard.dismiss(); // a focused input would keep the keyboard up under the overlay
    void unlock();
  }, [show, unlock]);

  // Children stay mounted (navigation/draft state survives); while locked they are inert and hidden behind an opaque overlay.
  return (
    <View style={s.root}>
      <View
        style={s.root}
        pointerEvents={show ? "none" : "auto"}
        importantForAccessibility={show ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={show}
      >
        {children}
      </View>
      {show && (
        <View style={[StyleSheet.absoluteFill, s.box, { backgroundColor: th.colors.background }]}>
          <Text style={[s.title, { color: th.colors.foreground, fontFamily: th.font.display }]}>nanobot</Text>
          <BotFace state="idle" size={72} />
          <Button title={t("extras.unlock")} onPress={() => void unlock()} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  box: { alignItems: "center", justifyContent: "center", gap: 24 },
  title: { fontSize: 28, lineHeight: 34 },
});

import React, { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Dimensions, Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";

export const SNACKBAR_MS = 4000;

export type ToastAction = { label: string; onPress: () => void };
export type ToastOptions = { action?: ToastAction };
type Shown = { message: string; action?: ToastAction } | null;
type Listener = (shown: Shown) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;

let nextHostId = 0;
const activeHosts = new Set<number>();
let topHostId: number | null = null;
const hostSubscribers = new Set<() => void>();

function notifyHosts() {
  hostSubscribers.forEach((fn) => fn());
}

function updateTopHost() {
  let max: number | null = null;
  for (const id of activeHosts) {
    if (max === null || id > max) max = id;
  }
  if (topHostId !== max) {
    topHostId = max;
    notifyHosts();
  }
}

function minHostId(): number | null {
  let min: number | null = null;
  for (const id of activeHosts) {
    if (min === null || id < min) min = id;
  }
  return min;
}

function subscribeHost(cb: () => void) {
  hostSubscribers.add(cb);
  return () => void hostSubscribers.delete(cb);
}

function getTopHost() {
  return topHostId;
}

let currentToast: { message: string; action?: ToastAction; expiresAt: number } | null = null;
let liftPx = 0;

function shownNow(): Shown {
  if (!currentToast || currentToast.expiresAt <= Date.now()) return null;
  return { message: currentToast.message, action: currentToast.action };
}

/** Distance from the bottom of the host. Keyboard overlap is only the part that still covers the window. */
export function snackbarBottom(opts: {
  insetBottom: number;
  keyboardHeight: number;
  windowHeight: number;
  screenHeight: number;
  lift: number;
}): number {
  const covered = Math.max(0, opts.screenHeight - opts.windowHeight);
  const overlap = Math.max(0, opts.keyboardHeight - covered);
  const lift = opts.lift > 0 ? opts.lift : 0;
  const gap = lift > 0 ? 8 : 16;
  return Math.max(opts.insetBottom, overlap) + lift + gap;
}

export const toast = {
  show(message: string, options?: ToastOptions) {
    if (!message) {
      currentToast = null;
      clearTimeout(timer);
      listeners.forEach((l) => l(null));
      return;
    }
    const action = options?.action?.label ? options.action : undefined;
    const expiresAt = Date.now() + SNACKBAR_MS;
    currentToast = { message, action, expiresAt };
    listeners.forEach((l) => l({ message, action }));
    clearTimeout(timer);
    timer = setTimeout(() => {
      currentToast = null;
      listeners.forEach((l) => l(null));
    }, SNACKBAR_MS);
  },
  /** The thread composer reports its height so the bar sits above it. Sheets ignore this. */
  setLift(px: number) {
    const next = Number.isFinite(px) && px > 0 ? px : 0;
    if (next === liftPx) return;
    liftPx = next;
    notifyHosts();
  },
};

function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export function ToastHost() {
  const th = useTheme();
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const [shown, setShown] = useState<Shown>(shownNow);
  const [id] = useState(() => ++nextHostId);
  const currentTop = useSyncExternalStore(subscribeHost, getTopHost, () => null);
  const lift = useSyncExternalStore(subscribeHost, () => liftPx, () => 0);
  const keyboard = useKeyboardHeight();

  useEffect(() => {
    activeHosts.add(id);
    updateTopHost();
    return () => {
      activeHosts.delete(id);
      updateTopHost();
    };
  }, [id]);

  useEffect(() => {
    listeners.add(setShown);
    const live = shownNow();
    if (live) setShown(live);
    return () => {
      listeners.delete(setShown);
      if (!listeners.size) {
        clearTimeout(timer);
        currentToast = null;
      }
    };
  }, []);

  if (currentTop !== id || !shown) return null;

  const bottom = snackbarBottom({
    insetBottom: insets.bottom,
    keyboardHeight: keyboard,
    windowHeight: Dimensions.get("window").height,
    screenHeight: Dimensions.get("screen").height,
    lift: id === minHostId() ? lift : 0,
  });
  const actionColor = th.scheme === "light" ? th.colors.brand : th.colors.primaryForeground;

  const runAction = () => {
    const snapshot = currentToast;
    snapshot?.action?.onPress();
    if (currentToast === snapshot) toast.show("");
  };

  return (
    <View testID="snackbar" pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 48,
          backgroundColor: th.colors.foreground,
          borderRadius: th.radius.md,
          paddingLeft: 16,
          paddingRight: shown.action ? 4 : 16,
        }}
      >
        <Text
          numberOfLines={1}
          accessibilityLiveRegion="polite"
          style={{ flex: 1, color: th.colors.background, fontFamily: th.font.regular, fontSize: 14 }}
        >
          {shown.message}
        </Text>
        {shown.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown.action.label}
            onPress={runAction}
            style={styles.action}
          >
            <Text numberOfLines={1} style={{ color: actionColor, fontFamily: th.font.medium, fontSize: 14 }}>
              {shown.action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16 },
  action: { minHeight: 48, minWidth: 48, justifyContent: "center", paddingHorizontal: 12 },
});

import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { useTheme } from "./ThemeProvider";

export type FaceState = "idle" | "thinking" | "working" | "offline" | "error";

/** Pure: which face the thread header shows. */
export function faceStateOf(conn: string, running: boolean, tooling: boolean, failed: boolean): FaceState {
  if (conn !== "open") return "offline";
  if (failed) return "error";
  if (running) return tooling ? "working" : "thinking";
  return "idle";
}

/**
 * The bot's face, the one animated element of the "Compagno" design (docs/design/companion.md):
 * idle blinks, thinking looks up, working glances side to side, offline is two flat lines.
 * Reduced motion keeps the shapes and drops the animation.
 */
export function BotFace({ state, size = 36 }: { state: FaceState; size?: number }) {
  const th = useTheme();
  const [still, setStill] = useState(false);
  const blink = useRef(new Animated.Value(1)).current;
  const glance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setStill(v)).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    blink.setValue(1);
    glance.setValue(0);
    if (still) return;
    let anim: Animated.CompositeAnimation | null = null;
    if (state === "idle") {
      anim = Animated.loop(Animated.sequence([
        Animated.delay(4200),
        Animated.timing(blink, { toValue: 0.1, duration: 90, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]));
    } else if (state === "working") {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(glance, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glance, { toValue: -1, duration: 1040, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glance, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]));
    }
    anim?.start();
    return () => anim?.stop();
  }, [state, still, blink, glance]);

  const u = size / 36;
  const eyeColor = state === "offline" ? th.colors.mutedForeground : state === "error" ? th.colors.destructive : th.colors.brand;
  const eye = {
    width: 6 * u,
    height: state === "offline" ? 2 * u : state === "error" ? 6 * u : 10 * u,
    borderRadius: 3 * u,
    backgroundColor: eyeColor,
  };
  const lift = state === "thinking" ? -4 * u : 0;
  const shift = glance.interpolate({ inputRange: [-1, 1], outputRange: [-3 * u, 3 * u] });
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: 12 * u, backgroundColor: th.scheme === "dark" ? th.colors.secondary : th.colors.foreground, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View style={{ flexDirection: "row", gap: 6 * u, transform: [{ translateY: lift }, { translateX: shift }, { scaleY: blink }] }}>
        <View testID={`face-eye-${state}`} style={eye} />
        <View style={eye} />
      </Animated.View>
    </View>
  );
}

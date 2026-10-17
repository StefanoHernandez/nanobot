import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { useTheme } from "./ThemeProvider";

export type FaceState = "idle" | "thinking" | "working" | "writing" | "offline" | "error";

/** Pure: which face the thread header shows. */
export function faceStateOf(
  conn: string,
  running: boolean,
  tooling: boolean,
  failed: boolean,
  streaming: boolean = false
): FaceState {
  if (conn !== "open") return "offline";
  if (failed) return "error";
  if (tooling) return "working";
  if (streaming) return "writing";
  if (running) return "thinking";
  return "idle";
}

/**
 * Nanobot's "Antenna" robot face with six states:
 * - idle: blinks every ~4s (eyes scaleY 1 -> 0.1 -> 1 in ~200ms)
 * - thinking: eyes move up 5 units with a soft spring, thought dots fade in a loop, antenna ball pulses
 * - working: eyes glance right/left in a 1.6s loop, dashed gear ring spins
 * - writing: eyes squint (scaleY 0.55, 3 units down), mouth bars bounce like an equalizer
 * - offline: flat line eyes (scaleY 0.18), grey antenna, still
 * - error: destructive colors, short head shake 3 times, then still
 */
export function BotFace({ state, size = 36 }: { state: FaceState; size?: number }) {
  const th = useTheme();
  const [still, setStill] = useState(false);
  const [motionChecked, setMotionChecked] = useState(false);

  // Animated values
  const eyeYAnim = useRef(new Animated.Value(0)).current;
  const eyeScaleYAnim = useRef(new Animated.Value(1)).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const glanceAnim = useRef(new Animated.Value(0)).current;
  const headShakeAnim = useRef(new Animated.Value(0)).current;
  const antennaPulseAnim = useRef(new Animated.Value(1)).current;

  // Thought dots opacities
  const dot1Anim = useRef(new Animated.Value(still ? 1 : 0.2)).current;
  const dot2Anim = useRef(new Animated.Value(still ? 1 : 0.2)).current;
  const dot3Anim = useRef(new Animated.Value(still ? 1 : 0.2)).current;

  // Gear rotation (0 to 1 -> 0deg to 360deg)
  const gearSpinAnim = useRef(new Animated.Value(0)).current;

  // Equalizer mouth bars
  const mouth1Anim = useRef(new Animated.Value(1)).current;
  const mouth2Anim = useRef(new Animated.Value(1)).current;
  const mouth3Anim = useRef(new Animated.Value(1)).current;

  const u = size / 100;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) {
          setStill(v);
          setMotionChecked(true);
        }
      })
      .catch(() => {
        if (alive) setMotionChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Smooth transitions between states on eye position and scaleY
  useEffect(() => {
    const targetY = state === "thinking" ? -5 * u : state === "writing" ? 3 * u : 0;
    const targetScale = state === "offline" ? 0.18 : state === "writing" ? 0.55 : 1.0;

    if (still || !motionChecked) {
      eyeYAnim.setValue(targetY);
      eyeScaleYAnim.setValue(targetScale);
      return;
    }

    if (state === "thinking") {
      Animated.spring(eyeYAnim, {
        toValue: targetY,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(eyeYAnim, {
        toValue: targetY,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

    Animated.timing(eyeScaleYAnim, {
      toValue: targetScale,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state, still, motionChecked, u, eyeYAnim, eyeScaleYAnim]);

  // State-specific loops and gestures
  useEffect(() => {
    // Reset transient loop values
    blinkAnim.setValue(1);
    glanceAnim.setValue(0);
    headShakeAnim.setValue(0);
    antennaPulseAnim.setValue(1);
    dot1Anim.setValue(still ? 1 : 0.2);
    dot2Anim.setValue(still ? 1 : 0.2);
    dot3Anim.setValue(still ? 1 : 0.2);
    gearSpinAnim.setValue(0);
    mouth1Anim.setValue(1);
    mouth2Anim.setValue(1);
    mouth3Anim.setValue(1);

    if (still || !motionChecked) return;

    let anim: Animated.CompositeAnimation | null = null;

    if (state === "idle") {
      anim = Animated.loop(
        Animated.sequence([
          Animated.delay(3800),
          Animated.timing(blinkAnim, { toValue: 0.1, duration: 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1.0, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      anim.start();
    } else if (state === "thinking") {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(antennaPulseAnim, { toValue: 0.25, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(antennaPulseAnim, { toValue: 1.0, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      const makeDot = (val: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(val, { toValue: 1, duration: 350, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(val, { toValue: 0.2, duration: 350, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.delay(Math.max(0, 400 - delay)),
          ])
        );
      anim = Animated.parallel([pulseLoop, makeDot(dot1Anim, 0), makeDot(dot2Anim, 200), makeDot(dot3Anim, 400)]);
      anim.start();
    } else if (state === "working") {
      const glanceLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glanceAnim, { toValue: 3.5 * u, duration: 400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(glanceAnim, { toValue: -3.5 * u, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(glanceAnim, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      const spinLoop = Animated.loop(
        Animated.timing(gearSpinAnim, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true })
      );
      anim = Animated.parallel([glanceLoop, spinLoop]);
      anim.start();
    } else if (state === "writing") {
      const m1 = Animated.loop(
        Animated.sequence([
          Animated.timing(mouth1Anim, { toValue: 1.6, duration: 180, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(mouth1Anim, { toValue: 0.5, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(mouth1Anim, { toValue: 1.0, duration: 160, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      const m2 = Animated.loop(
        Animated.sequence([
          Animated.timing(mouth2Anim, { toValue: 0.4, duration: 150, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(mouth2Anim, { toValue: 1.7, duration: 250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(mouth2Anim, { toValue: 1.0, duration: 180, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      const m3 = Animated.loop(
        Animated.sequence([
          Animated.timing(mouth3Anim, { toValue: 1.4, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(mouth3Anim, { toValue: 0.6, duration: 180, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(mouth3Anim, { toValue: 1.0, duration: 180, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      anim = Animated.parallel([m1, m2, m3]);
      anim.start();
    } else if (state === "error") {
      anim = Animated.sequence([
        Animated.timing(headShakeAnim, { toValue: -4 * u, duration: 50, useNativeDriver: true }),
        Animated.timing(headShakeAnim, { toValue: 4 * u, duration: 60, useNativeDriver: true }),
        Animated.timing(headShakeAnim, { toValue: -3 * u, duration: 60, useNativeDriver: true }),
        Animated.timing(headShakeAnim, { toValue: 3 * u, duration: 60, useNativeDriver: true }),
        Animated.timing(headShakeAnim, { toValue: -2 * u, duration: 60, useNativeDriver: true }),
        Animated.timing(headShakeAnim, { toValue: 2 * u, duration: 60, useNativeDriver: true }),
        Animated.timing(headShakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]);
      anim.start();
    }

    return () => {
      anim?.stop();
    };
  }, [
    state,
    still,
    motionChecked,
    u,
    blinkAnim,
    glanceAnim,
    headShakeAnim,
    antennaPulseAnim,
    dot1Anim,
    dot2Anim,
    dot3Anim,
    gearSpinAnim,
    mouth1Anim,
    mouth2Anim,
    mouth3Anim,
  ]);

  // Color assignments per brief:
  // - Head: dark theme = colors.accent (#272233), light theme = colors.foreground (#1c1428)
  const headColor = th.scheme === "dark" ? th.colors.accent : th.colors.foreground;
  // - Ears: slightly lighter tone than the head
  const earColor = th.scheme === "dark" ? "#383147" : "#352a47";
  // - Antenna: colors.brand, offline = mutedForeground, error = colors.destructive
  const antennaColor = state === "offline" ? th.colors.mutedForeground : state === "error" ? th.colors.destructive : th.colors.brand;
  // - Eyes: colors.brand, offline = mutedForeground, error = colors.destructive
  const eyeColor = state === "offline" ? th.colors.mutedForeground : state === "error" ? th.colors.destructive : th.colors.brand;

  const totalEyeScaleY = Animated.multiply(eyeScaleYAnim, blinkAnim);
  const gearSpinInterpolation = gearSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      testID={`face-${state}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        overflow: "visible",
        transform: [{ translateX: headShakeAnim }],
      }}
    >
      {/* Base robot SVG: ears, antenna line, head */}
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", left: 0, top: 0 }}>
        {/* Ears: 6x16, radius 3 at x12 and x82, y44 */}
        <Rect x={12} y={44} width={6} height={16} rx={3} ry={3} fill={earColor} />
        <Rect x={82} y={44} width={6} height={16} rx={3} ry={3} fill={earColor} />

        {/* Antenna line: from y14 to y24 at x50 */}
        <Line x1={50} y1={14} x2={50} y2={24} stroke={antennaColor} strokeWidth={2.5} strokeLinecap="round" />

        {/* Head: rounded rect, x18 y24, 64x56, radius 18 */}
        <Rect x={18} y={24} width={64} height={56} rx={18} ry={18} fill={headColor} />
      </Svg>

      {/* Antenna ball at cx50 cy11, r4.5 with pulse opacity */}
      <Animated.View
        style={{
          position: "absolute",
          left: 45.5 * u,
          top: 6.5 * u,
          width: 9 * u,
          height: 9 * u,
          borderRadius: 4.5 * u,
          backgroundColor: antennaColor,
          opacity: antennaPulseAnim,
        }}
      />

      {/* Eyes: two rounded bars 9x16, radius 4.5 at x34 and x57, y40 */}
      <Animated.View
        style={{
          position: "absolute",
          left: 34 * u,
          top: 40 * u,
          width: 32 * u,
          height: 16 * u,
          transform: [{ translateY: eyeYAnim }, { translateX: glanceAnim }, { scaleY: totalEyeScaleY }],
        }}
      >
        <View
          testID={`face-eye-${state}`}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 9 * u,
            height: 16 * u,
            borderRadius: 4.5 * u,
            backgroundColor: eyeColor,
          }}
        />
        <View
          style={{
            position: "absolute",
            left: 23 * u,
            top: 0,
            width: 9 * u,
            height: 16 * u,
            borderRadius: 4.5 * u,
            backgroundColor: eyeColor,
          }}
        />
      </Animated.View>

      {/* Thought dots (state === "thinking"): top right, growing in size */}
      {state === "thinking" ? (
        <>
          <Animated.View
            style={{
              position: "absolute",
              left: 72 * u,
              top: 18 * u,
              width: 4 * u,
              height: 4 * u,
              borderRadius: 2 * u,
              backgroundColor: th.colors.primary,
              opacity: dot1Anim,
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: 78.2 * u,
              top: 11.2 * u,
              width: 5.6 * u,
              height: 5.6 * u,
              borderRadius: 2.8 * u,
              backgroundColor: th.colors.primary,
              opacity: dot2Anim,
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: 85.2 * u,
              top: 4.2 * u,
              width: 7.6 * u,
              height: 7.6 * u,
              borderRadius: 3.8 * u,
              backgroundColor: th.colors.primary,
              opacity: dot3Anim,
            }}
          />
        </>
      ) : null}

      {/* Gear ring (state === "working"): dashed ring bottom right, spins */}
      {state === "working" ? (
        <Animated.View
          style={{
            position: "absolute",
            left: 73 * u,
            top: 69 * u,
            width: 18 * u,
            height: 18 * u,
            transform: [{ rotate: gearSpinInterpolation }],
          }}
        >
          <Svg width={18 * u} height={18 * u} viewBox="0 0 18 18">
            <Circle
              cx={9}
              cy={9}
              r={7}
              stroke={th.colors.primary}
              strokeWidth={2}
              strokeDasharray="3 2"
              fill="none"
            />
          </Svg>
        </Animated.View>
      ) : null}

      {/* Mouth (state === "writing"): 3 small bars under the eyes at x40, x48, x56, y64 */}
      {state === "writing" ? (
        <>
          <Animated.View
            style={{
              position: "absolute",
              left: 40 * u,
              top: 64 * u,
              width: 4 * u,
              height: 7 * u,
              borderRadius: 2 * u,
              backgroundColor: th.colors.primary,
              transform: [{ scaleY: mouth1Anim }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: 48 * u,
              top: 64 * u,
              width: 4 * u,
              height: 7 * u,
              borderRadius: 2 * u,
              backgroundColor: th.colors.primary,
              transform: [{ scaleY: mouth2Anim }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: 56 * u,
              top: 64 * u,
              width: 4 * u,
              height: 7 * u,
              borderRadius: 2 * u,
              backgroundColor: th.colors.primary,
              transform: [{ scaleY: mouth3Anim }],
            }}
          />
        </>
      ) : null}
    </Animated.View>
  );
}

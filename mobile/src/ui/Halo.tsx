import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "./ThemeProvider";

/** Soft accent glow at the top of a screen (Herald halo), drawn behind content. */
export function Halo() {
  const th = useTheme();
  const id = "nb-halo";
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Svg width="100%" height={260} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={id} cx="15%" cy="0%" rx="80%" ry="70%">
            <Stop offset="0%" stopColor={th.colors.accentSoft} stopOpacity={1} />
            <Stop offset="70%" stopColor={th.colors.accentSoft} stopOpacity={0} />
            <Stop offset="100%" stopColor={th.colors.accentSoft} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, height: 260, zIndex: 0 },
});

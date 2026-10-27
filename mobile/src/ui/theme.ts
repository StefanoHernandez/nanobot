export function hslToHex(triplet: string): string {
  const [h, s, l] = triplet.split(/\s+/).map((v) => parseFloat(v));
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** hex "#rrggbb" + alpha 0..1 -> "#rrggbbaa" */
export function withAlpha(hex: string, alpha: number): string {
  const base = hex.length >= 7 ? hex.slice(0, 7) : hex;
  return base + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

import type { ViewStyle } from "react-native";

export type TypeStyle = { fontSize: number; lineHeight: number; letterSpacing: number };

export type Theme = {
  scheme: "light" | "dark";
  colors: {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    destructiveForeground: string;
    success: string;
    border: string;
    input: string;
    ring: string;
    overlay: string;
    overlayForeground: string;
    brand: string;
    brandForeground: string;
    brandSoft: string;
    brandSoftForeground: string;
    userBubble: string;
    userBubbleForeground: string;
    chartInput: string;
    chartOutput: string;
    chartCached: string;
    chartWarn: string;
    surface2: string;
    surface3: string;
    well: string;
    thumb: string;
    textSecondary: string;
    textMuted: string;
    borderStrong: string;
    accentSoft: string;
    accentText: string;
    inverse: string;
    inverseForeground: string;
    dangerSoft: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
  };
  radius: { xs: number; sm: number; md: number; lg: number; xl: number };
  surface: ViewStyle;
  /** Kept for compatibility: older screens spread this around the composer; now a no-op tray. */
  bezel: ViewStyle;
  spacing: (n: number) => number;
  font: {
    regular: string;
    medium: string;
    semibold: string;
    label: string;
    mono: string;
    display: string;
    displayBold: string;
  };
  type: {
    display: TypeStyle;
    title: TypeStyle;
    heading: TypeStyle;
    body: TypeStyle;
    bodySmall: TypeStyle;
    label: TypeStyle;
    caption: TypeStyle;
    code: TypeStyle;
    eyebrow: TypeStyle;
  };
};

export const ACCENT_IDS = ["violet", "blue", "green", "orange", "pink", "teal"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

const DARK_TEXT = "#0A0A0C";
const HERALD_BLUE = "#2F6BF5";

const em = (fontSize: number, emValue: number) => fontSize * emValue;

const TYPE_SCALE = {
  display: { fontSize: 32, lineHeight: 35, letterSpacing: em(32, -0.03) },
  title: { fontSize: 22, lineHeight: 26, letterSpacing: em(22, -0.02) },
  heading: { fontSize: 16, lineHeight: 21, letterSpacing: em(16, -0.01) },
  body: { fontSize: 15, lineHeight: 22.5, letterSpacing: em(15, -0.005) },
  bodySmall: { fontSize: 13.5, lineHeight: 19.5, letterSpacing: em(13.5, -0.005) },
  label: { fontSize: 13, lineHeight: 17, letterSpacing: em(13, -0.005) },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: em(12, -0.005) },
  code: { fontSize: 12.5, lineHeight: 19.5, letterSpacing: 0 },
  eyebrow: { fontSize: 11, lineHeight: 14, letterSpacing: em(11, 0.08) },
};

const PALETTE = {
  dark: {
    bg: "#0A0A0C",
    surface: "#16161A",
    surface2: "#1C1C22",
    surface3: "#232329",
    well: "#121215",
    thumb: "#2C2C33",
    sheet: "#18181D",
    border: withAlpha("#ffffff", 0.07),
    borderStrong: withAlpha("#ffffff", 0.12),
    text: "#F4F4F6",
    text2: "#D4D4D8",
    text4: "#8A8A94",
    text5: "#6B6B75",
    danger: "#F85149",
    success: "#3FB950",
    warning: "#F5A524",
    dangerSoft: withAlpha("#F85149", 0.14),
    successSoft: withAlpha("#3FB950", 0.13),
    warningSoft: withAlpha("#F5A524", 0.13),
    overlay: "#020203",
  },
  light: {
    bg: "#F7F7F9",
    surface: "#FFFFFF",
    surface2: "#F1F1F5",
    surface3: "#E9E9EF",
    well: "#F3F3F7",
    thumb: "#FFFFFF",
    sheet: "#FFFFFF",
    border: withAlpha("#0A0A1E", 0.08),
    borderStrong: withAlpha("#0A0A1E", 0.14),
    text: "#0A0A0C",
    text2: "#27272A",
    text4: "#6B6B75",
    text5: "#8E8E98",
    danger: "#CF222E",
    success: "#1A7F37",
    warning: "#B76E00",
    dangerSoft: withAlpha("#CF222E", 0.09),
    successSoft: withAlpha("#1A7F37", 0.1),
    warningSoft: withAlpha("#B76E00", 0.1),
    overlay: "#0A0A0C",
  },
};

export const ACCENT_STOPS: Record<AccentId, { light: string; dark: string }> = {
  violet: { light: "#7C3AED", dark: "#A78BFA" },
  blue: { light: HERALD_BLUE, dark: HERALD_BLUE },
  green: { light: "#137538", dark: "#3FB950" },
  orange: { light: "#B04700", dark: "#F0883E" },
  pink: { light: "#B0327E", dark: "#F778BA" },
  teal: { light: "#0C6A84", dark: "#22D3EE" },
};

function accentFor(scheme: Theme["scheme"], id: AccentId) {
  if (id === "blue") {
    if (scheme === "light") {
      return {
        accent: HERALD_BLUE,
        onAccent: "#ffffff",
        accentText: "#1F56D6",
        accentSoft: withAlpha(HERALD_BLUE, 0.1),
      };
    }
    return {
      accent: HERALD_BLUE,
      onAccent: "#ffffff",
      accentText: "#7AA5FF",
      accentSoft: withAlpha("#4A84FE", 0.14),
    };
  }
  const stops = ACCENT_STOPS[id];
  const accent = scheme === "light" ? stops.light : stops.dark;
  const onAccent = scheme === "light" ? "#ffffff" : DARK_TEXT;
  const softAlpha = scheme === "light" ? 0.1 : 0.14;
  return {
    accent,
    onAccent,
    accentText: accent,
    accentSoft: withAlpha(accent, softAlpha),
  };
}

function baseColors(scheme: Theme["scheme"], accentId: AccentId): Theme["colors"] {
  const p = scheme === "light" ? PALETTE.light : PALETTE.dark;
  const a = accentFor(scheme, accentId);
  const inverse = p.text;
  const inverseForeground = scheme === "light" ? "#ffffff" : p.bg;

  return {
    background: p.bg,
    foreground: p.text,
    card: p.surface,
    cardForeground: p.text,
    popover: p.sheet,
    popoverForeground: p.text,
    primary: a.accent,
    primaryForeground: a.onAccent,
    secondary: p.surface2,
    secondaryForeground: p.text,
    muted: p.surface3,
    mutedForeground: p.text4,
    accent: p.surface3,
    accentForeground: p.text,
    destructive: p.danger,
    destructiveForeground: p.danger,
    success: p.success,
    border: p.border,
    input: p.surface,
    ring: a.accent,
    overlay: p.overlay,
    overlayForeground: "#ffffff",
    brand: a.accent,
    brandForeground: a.onAccent,
    brandSoft: a.accentSoft,
    brandSoftForeground: a.accentText,
    userBubble: a.accent,
    userBubbleForeground: a.onAccent,
    chartInput: a.accentText,
    chartOutput: p.text2,
    chartCached: p.text4,
    chartWarn: p.danger,
    surface2: p.surface2,
    surface3: p.surface3,
    well: p.well,
    thumb: p.thumb,
    textSecondary: p.text2,
    textMuted: p.text5,
    borderStrong: p.borderStrong,
    accentSoft: a.accentSoft,
    accentText: a.accentText,
    inverse,
    inverseForeground,
    dangerSoft: p.dangerSoft,
    successSoft: p.successSoft,
    warning: p.warning,
    warningSoft: p.warningSoft,
  };
}

const FONT = {
  regular: "Geist_400Regular",
  medium: "Geist_600SemiBold",
  semibold: "Geist_600SemiBold",
  label: "Geist_500Medium",
  mono: "GeistMono_400Regular",
  display: "Geist_600SemiBold",
  displayBold: "Geist_600SemiBold",
};

export function buildTheme(scheme: Theme["scheme"], accentId: AccentId = "violet"): Theme {
  const colors = baseColors(scheme, accentId);
  const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 26 };
  return {
    scheme,
    colors,
    radius,
    surface: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bezel: {
      padding: 0,
      backgroundColor: "transparent",
      borderWidth: 0,
    },
    spacing: (n) => 4 * n,
    font: FONT,
    type: TYPE_SCALE,
  };
}

const themeCache = new Map<string, Theme>();
export function getTheme(scheme: Theme["scheme"], accentId: AccentId): Theme {
  const key = `${scheme}:${accentId}`;
  let hit = themeCache.get(key);
  if (!hit) {
    hit = buildTheme(scheme, accentId);
    themeCache.set(key, hit);
  }
  return hit;
}

export function parseAccentId(raw: string | null | undefined): AccentId {
  return (ACCENT_IDS as readonly string[]).includes(raw ?? "") ? (raw as AccentId) : "violet";
}

export const lightTheme = getTheme("light", "violet");
export const darkTheme = getTheme("dark", "violet");

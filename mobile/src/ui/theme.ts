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
  return hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

import type { ViewStyle } from "react-native";

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
    /** The bot's colour (sunflower): eyes, send button, "alive" accents. Never for errors. */
    brand: string;
    brandForeground: string;
    /** Tool-activity chips. */
    brandSoft: string;
    brandSoftForeground: string;
    userBubble: string;
    userBubbleForeground: string;
    /** Data series (context chart): distinct by lightness as well as hue, so they survive colour-blindness. */
    chartInput: string;
    chartOutput: string;
    chartCached: string;
    chartWarn: string;
  };
  radius: { sm: number; md: number; lg: number };
  /** A floating card: hairline edge, lit top edge and a wide, soft shadow. Spread it into a View style. */
  surface: ViewStyle;
  /** The outer tray of a "double bezel" (composer, dialogs): a faint shell around the surface. */
  bezel: ViewStyle;
  spacing: (n: number) => number;
  /** Atkinson Hyperlegible for UI/body, Bricolage Grotesque for display (see docs/design/companion.md). */
  font: { regular: string; medium: string; mono: string; display: string; displayBold: string };
};

// Look test "Soft", 2026-10-16: the same black, purple and gold, on softer, floating surfaces.
// Light: silver-lilac paper, white cards lifted by a wide diffused shadow, ink hairlines.
const LIGHT: Theme["colors"] = {
  background: "#f3f1f7",
  foreground: "#1c1428",
  card: "#ffffff",
  cardForeground: "#1c1428",
  popover: "#ffffff",
  popoverForeground: "#1c1428",
  primary: "#3f2564",
  primaryForeground: "#ffffff",
  secondary: "#ebe7f2",
  secondaryForeground: "#1c1428",
  muted: "#ebe7f2",
  mutedForeground: "#5c4e70",
  accent: "#e6e0f0",
  accentForeground: "#1c1428",
  destructive: "#b42318",
  destructiveForeground: "#ffffff",
  success: "#176b42",
  border: "#1c142812",
  input: "#1c14281c",
  ring: "#c9840a",
  overlay: "#120c18",
  overlayForeground: "#ffffff",
  brand: "#e0a01a",
  brandForeground: "#1c1428",
  brandSoft: "#f8e7c0",
  brandSoftForeground: "#5c3d06",
  userBubble: "#3f2564",
  userBubbleForeground: "#ffffff",
  chartInput: "#4a2c72",
  chartOutput: "#8a5608",
  chartCached: "#8b74a6",
  chartWarn: "#b42318",
};

// Dark: near-OLED black with a violet cast, glassy cards edged by white hairlines.
const DARK: Theme["colors"] = {
  background: "#08070b",
  foreground: "#f4f0f8",
  card: "#131119",
  cardForeground: "#f4f0f8",
  popover: "#1b1823",
  popoverForeground: "#f4f0f8",
  primary: "#cfb0ec",
  primaryForeground: "#1a1022",
  secondary: "#211d2b",
  secondaryForeground: "#f4f0f8",
  muted: "#18151f",
  mutedForeground: "#c4b4d4",
  accent: "#272233",
  accentForeground: "#f4f0f8",
  destructive: "#ff9a94",
  destructiveForeground: "#2a0d0b",
  success: "#7dcca0",
  border: "#ffffff14",
  input: "#ffffff1f",
  ring: "#f0b429",
  overlay: "#020203",
  overlayForeground: "#ffffff",
  brand: "#f0b429",
  brandForeground: "#1a1404",
  brandSoft: "#3a3218",
  brandSoftForeground: "#f8e2a8",
  userBubble: "#5d3b7c",
  userBubbleForeground: "#ffffff",
  chartInput: "#e4d0f5",
  chartOutput: "#f0b429",
  chartCached: "#9b86b0",
  chartWarn: "#ff9b94",
};

const build = (scheme: Theme["scheme"], colors: Theme["colors"]): Theme => ({
  scheme,
  colors,
  radius: { sm: 12, md: 22, lg: 30 },
  surface: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    // The top edge catches the light, like a glass plate in a tray.
    borderTopColor: scheme === "dark" ? "#ffffff24" : "#ffffff",
    boxShadow:
      scheme === "dark"
        ? "0 1px 0 0 rgba(0,0,0,0.6), 0 18px 40px -16px rgba(0,0,0,0.8)"
        : "0 1px 2px 0 rgba(28,20,40,0.04), 0 16px 36px -14px rgba(28,20,40,0.14)",
  },
  bezel: {
    padding: 5,
    borderRadius: 30 + 5,
    backgroundColor: scheme === "dark" ? "#ffffff08" : "#1c142808",
    borderWidth: 1,
    borderColor: scheme === "dark" ? "#ffffff0d" : "#1c14280a",
  },
  spacing: (n) => 4 * n,
  // Embedded by the expo-font config plugin (app.json): Android family name = file name.
  font: {
    regular: "AtkinsonHyperlegible_400Regular",
    medium: "AtkinsonHyperlegible_700Bold",
    mono: "monospace",
    display: "BricolageGrotesque_800ExtraBold",
    displayBold: "BricolageGrotesque_700Bold",
  },
});

export const lightTheme = build("light", LIGHT);
export const darkTheme = build("dark", DARK);

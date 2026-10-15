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
  spacing: (n: number) => number;
  /** Atkinson Hyperlegible for UI/body, Bricolage Grotesque for display (see docs/design/companion.md). */
  font: { regular: string; medium: string; mono: string; display: string; displayBold: string };
};

// Compagno, 2026-10-15: black, purple, gold. Light is the same trio on paper.
// Gold is the bot (eyes, send). Purple is you and the actions. Surfaces step up in the dark.
const LIGHT: Theme["colors"] = {
  background: "#f7f4fb",
  foreground: "#1c1428",
  card: "#ffffff",
  cardForeground: "#1c1428",
  popover: "#ffffff",
  popoverForeground: "#1c1428",
  primary: "#4a2c72",
  primaryForeground: "#ffffff",
  secondary: "#efe6f6",
  secondaryForeground: "#1c1428",
  muted: "#efe6f6",
  mutedForeground: "#5c4e70",
  accent: "#e4d8f2",
  accentForeground: "#1c1428",
  destructive: "#b42318",
  destructiveForeground: "#ffffff",
  success: "#176b42",
  border: "#e0d6ec",
  input: "#e0d6ec",
  ring: "#c9840a",
  overlay: "#120c18",
  overlayForeground: "#ffffff",
  brand: "#e0a01a",
  brandForeground: "#1c1428",
  brandSoft: "#f8e7c0",
  brandSoftForeground: "#5c3d06",
  userBubble: "#4a2c72",
  userBubbleForeground: "#ffffff",
  chartInput: "#4a2c72",
  chartOutput: "#8a5608",
  chartCached: "#8b74a6",
  chartWarn: "#b42318",
};

const DARK: Theme["colors"] = {
  background: "#0c0b10",
  foreground: "#f4f0f8",
  card: "#16141e",
  cardForeground: "#f4f0f8",
  popover: "#221e2c",
  popoverForeground: "#f4f0f8",
  primary: "#c9a6e8",
  primaryForeground: "#1a1022",
  secondary: "#2a2436",
  secondaryForeground: "#f4f0f8",
  muted: "#1c1826",
  mutedForeground: "#c4b4d4",
  accent: "#2e2840",
  accentForeground: "#f4f0f8",
  destructive: "#ff9a94",
  destructiveForeground: "#2a0d0b",
  success: "#7dcca0",
  border: "#3a3348",
  input: "#3a3348",
  ring: "#f0b429",
  overlay: "#05040a",
  overlayForeground: "#ffffff",
  brand: "#f0b429",
  brandForeground: "#1a1404",
  brandSoft: "#3a3218",
  brandSoftForeground: "#f8e2a8",
  userBubble: "#6b4589",
  userBubbleForeground: "#ffffff",
  chartInput: "#e4d0f5",
  chartOutput: "#f0b429",
  chartCached: "#9b86b0",
  chartWarn: "#ff9b94",
};

const build = (scheme: Theme["scheme"], colors: Theme["colors"]): Theme => ({
  scheme,
  colors,
  radius: { sm: 10, md: 18, lg: 24 },
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

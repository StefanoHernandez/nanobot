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

// Design direction "Compagno" (mobile/docs/design/companion.md).
const LIGHT: Theme["colors"] = {
  background: "#eef0ff",
  foreground: "#1e2150",
  card: "#ffffff",
  cardForeground: "#1e2150",
  popover: "#ffffff",
  popoverForeground: "#1e2150",
  primary: "#1e2150",
  primaryForeground: "#ffffff",
  secondary: "#e1e4fb",
  secondaryForeground: "#1e2150",
  muted: "#e1e4fb",
  mutedForeground: "#5a5e9a",
  accent: "#dcdffa",
  accentForeground: "#1e2150",
  destructive: "#c2413b",
  destructiveForeground: "#ffffff",
  success: "#2e8a5b",
  border: "#d3d7f3",
  input: "#d3d7f3",
  ring: "#f4b63f",
  overlay: "#14163a",
  overlayForeground: "#ffffff",
  brand: "#f4b63f",
  brandForeground: "#1e2150",
  brandSoft: "#fce7b8",
  brandSoftForeground: "#6b4a07",
  userBubble: "#1e2150",
  userBubbleForeground: "#ffffff",
  chartInput: "#2f3389",
  chartOutput: "#b8780a",
  chartCached: "#7f84cf",
  chartWarn: "#c2413b",
};

// Dark: the user's palette (2026-10-15): Evergreen #16302b, Vintage Grape #694873, Dusty Mauve #8b728e.
// Surfaces step up in lightness (bg < card < popover); you are grape, the bot stays sunflower.
const DARK: Theme["colors"] = {
  background: "#0e221e",
  foreground: "#e8f0ed",
  card: "#16302b",
  cardForeground: "#e8f0ed",
  popover: "#1c3a34",
  popoverForeground: "#e8f0ed",
  primary: "#c9a7d2",
  primaryForeground: "#2a1a30",
  secondary: "#234640",
  secondaryForeground: "#e8f0ed",
  muted: "#1f3d37",
  mutedForeground: "#b9a8bd",
  accent: "#2a4a43",
  accentForeground: "#e8f0ed",
  destructive: "#ff9a94",
  destructiveForeground: "#2a0d0b",
  success: "#74d4a8",
  border: "#2d4d46",
  input: "#2d4d46",
  ring: "#f4b63f",
  overlay: "#050f0d",
  overlayForeground: "#ffffff",
  brand: "#f4b63f",
  brandForeground: "#241a03",
  brandSoft: "#3a3a1a",
  brandSoftForeground: "#f7dc9b",
  userBubble: "#694873",
  userBubbleForeground: "#ffffff",
  chartInput: "#e4d4ec",
  chartOutput: "#f4b63f",
  chartCached: "#9d7fa3",
  chartWarn: "#ff9a94",
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

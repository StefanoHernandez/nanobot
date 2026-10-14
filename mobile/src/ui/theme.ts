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
};

const DARK: Theme["colors"] = {
  background: "#14163a",
  foreground: "#ecedff",
  card: "#1e2150",
  cardForeground: "#ecedff",
  popover: "#232764",
  popoverForeground: "#ecedff",
  primary: "#f4b63f",
  primaryForeground: "#1e2150",
  secondary: "#2a2e6e",
  secondaryForeground: "#ecedff",
  muted: "#262a66",
  mutedForeground: "#a3a7d6",
  accent: "#2f3478",
  accentForeground: "#ecedff",
  destructive: "#ff8a80",
  destructiveForeground: "#14163a",
  success: "#5cc98f",
  border: "#33377a",
  input: "#33377a",
  ring: "#f4b63f",
  overlay: "#08091f",
  overlayForeground: "#ffffff",
  brand: "#f4b63f",
  brandForeground: "#1e2150",
  brandSoft: "#4a3a12",
  brandSoftForeground: "#fce7b8",
  userBubble: "#3a3f8f",
  userBubbleForeground: "#ffffff",
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

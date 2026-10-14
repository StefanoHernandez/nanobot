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
  };
  radius: { sm: number; md: number; lg: number };
  spacing: (n: number) => number;
  font: { regular: string; medium: string; mono: string };
};

// HSL triplets copied by hand from docs/agy/assets/nanobot-globals.css (`:root` = light, `.dark` = dark).
// `var(--x)` references are resolved to the referenced token's triplet.
const LIGHT = {
  background: "0 0% 100%",
  foreground: "240 3% 12%",
  card: "0 0% 100%",
  cardForeground: "240 3% 12%",
  popover: "0 0% 100%",
  popoverForeground: "240 3% 12%",
  primary: "240 4% 16%",
  primaryForeground: "0 0% 98%",
  secondary: "0 0% 96.1%",
  secondaryForeground: "0 0% 9%",
  muted: "0 0% 96.1%",
  mutedForeground: "0 0% 45.1%",
  accent: "0 0% 96.1%",
  accentForeground: "0 0% 9%",
  destructive: "0 84.2% 60.2%",
  destructiveForeground: "0 0% 98%",
  success: "142.1 76.2% 36.3%",
  border: "40 8% 90.5%",
  input: "40 8% 90.5%",
  ring: "0 0% 3.9%",
  overlay: "0 0% 4%",
  overlayForeground: "0 0% 98%",
};

const DARK_CARD = "0 0% 22%";
const DARK_BORDER = "0 0% 28%";
const DARK: typeof LIGHT = {
  background: "0 0% 19%",
  foreground: "240 4% 96%",
  card: DARK_CARD,
  cardForeground: "240 4% 96%",
  popover: DARK_CARD, // var(--card)
  popoverForeground: "240 4% 96%",
  primary: "240 5% 98%",
  primaryForeground: "0 0% 9%",
  secondary: DARK_CARD, // var(--card)
  secondaryForeground: "0 0% 98%",
  muted: DARK_CARD, // var(--card)
  mutedForeground: "0 0% 65%",
  accent: "0 0% 25%",
  accentForeground: "0 0% 98%",
  destructive: "0 93.5% 81.8%",
  destructiveForeground: "0 0% 9%",
  success: "142.1 70.6% 45.3%",
  border: DARK_BORDER,
  input: DARK_BORDER, // var(--border)
  ring: "0 0% 83.1%",
  overlay: "0 0% 4%",
  overlayForeground: "0 0% 98%",
};

const build = (scheme: Theme["scheme"], tokens: typeof LIGHT): Theme => ({
  scheme,
  colors: Object.fromEntries(
    Object.entries(tokens).map(([k, v]) => [k, hslToHex(v)]),
  ) as Theme["colors"],
  // --radius: 0.4375rem = 7px
  radius: { sm: 4, md: 7, lg: 12 },
  spacing: (n) => 4 * n,
  font: { regular: "System", medium: "System", mono: "monospace" },
});

export const lightTheme = build("light", LIGHT);
export const darkTheme = build("dark", DARK);

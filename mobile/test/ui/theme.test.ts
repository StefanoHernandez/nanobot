import { ACCENT_IDS, buildTheme, darkTheme, getTheme, hslToHex, lightTheme } from "../../src/ui/theme";

test("hslToHex", () => {
  expect(hslToHex("222.2 84% 4.9%")).toBe("#020817");
  expect(hslToHex("0 0% 100%")).toBe("#ffffff");
});

test("light and dark differ", () => {
  expect(lightTheme.colors.background).not.toBe(darkTheme.colors.background);
});

const ALPHA_KEYS = new Set(["border", "borderStrong", "accentSoft", "dangerSoft", "successSoft", "warningSoft", "brandSoft"]);

test("colors are hex; hairlines and soft tints may carry alpha", () => {
  for (const t of [lightTheme, darkTheme])
    for (const [k, c] of Object.entries(t.colors))
      expect(c.toLowerCase()).toMatch(ALPHA_KEYS.has(k) ? /^#[0-9a-f]{8}$/ : /^#[0-9a-f]{6}$/);
});

const lum = (hex: string) => {
  const base = hex.length === 9 ? hex.slice(0, 7) : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test("text pairs meet WCAG AA (4.5:1) in both schemes", () => {
  for (const { colors: c } of [lightTheme, darkTheme]) {
    const pairs: [string, string][] = [
      [c.foreground, c.background],
      [c.mutedForeground, c.background],
      [c.cardForeground, c.card],
      [c.textSecondary, c.background],
      [c.primaryForeground, c.primary],
      [c.userBubbleForeground, c.userBubble],
      [c.secondaryForeground, c.secondary],
    ];
    for (const [fg, bg] of pairs) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  }
});

test("accent text on background meets 4.5:1 for every accent and scheme", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const accent of ACCENT_IDS) {
      const { colors: c } = getTheme(scheme, accent);
      expect(contrast(c.accentText, c.background)).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("chart series read against the panel (3:1) and differ from each other", () => {
  for (const { colors: c } of [lightTheme, darkTheme]) {
    const series = [c.chartInput, c.chartOutput, c.chartCached, c.chartWarn];
    for (const s of series) expect(contrast(s, c.popover)).toBeGreaterThanOrEqual(3);
    expect(new Set(series).size).toBe(4);
  }
});

test("graphite surfaces step up in lightness without violet cast", () => {
  expect(darkTheme.colors.background).toBe("#0A0A0C");
  expect(darkTheme.colors.userBubble).toBe("#A78BFA");
  expect(darkTheme.colors.brand).toBe(darkTheme.colors.primary);
  expect(lum(darkTheme.colors.background)).toBeLessThan(lum(darkTheme.colors.card));
  expect(lum(darkTheme.colors.card)).toBeLessThan(lum(darkTheme.colors.surface2));
  expect(buildTheme("light", "green").colors.primary).toBe("#137538");
});

import { hslToHex, lightTheme, darkTheme } from "../../src/ui/theme";

test("hslToHex", () => {
  expect(hslToHex("222.2 84% 4.9%")).toBe("#020817");
  expect(hslToHex("0 0% 100%")).toBe("#ffffff");
});

test("light and dark differ", () => {
  expect(lightTheme.colors.background).not.toBe(darkTheme.colors.background);
});

test("all colors are 6-digit hex", () => {
  for (const t of [lightTheme, darkTheme])
    for (const c of Object.values(t.colors)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
});

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test("text pairs meet WCAG AA (4.5:1) in both schemes", () => {
  for (const { colors: c } of [lightTheme, darkTheme]) {
    const pairs: [string, string][] = [
      [c.foreground, c.background], [c.mutedForeground, c.background], [c.cardForeground, c.card],
      [c.mutedForeground, c.card], [c.primaryForeground, c.primary], [c.brandForeground, c.brand],
      [c.brandSoftForeground, c.brandSoft], [c.userBubbleForeground, c.userBubble], [c.secondaryForeground, c.secondary],
    ];
    for (const [fg, bg] of pairs) expect([fg, bg, contrast(fg, bg) >= 4.5]).toEqual([fg, bg, true]);
  }
});

test("chart series read against the panel (3:1, non-text graphics) and differ from each other", () => {
  for (const { colors: c } of [lightTheme, darkTheme]) {
    const series = [c.chartInput, c.chartOutput, c.chartCached, c.chartWarn];
    for (const s of series) expect([s, contrast(s, c.popover) >= 3]).toEqual([s, true]);
    // input vs cached share a hue family: they must differ clearly in lightness
    expect(contrast(c.chartInput, c.chartCached)).toBeGreaterThanOrEqual(1.8);
    expect(new Set(series).size).toBe(4);
  }
});

test("the user's dark palette is used: Evergreen card, Vintage Grape bubble", () => {
  expect(darkTheme.colors.card).toBe("#16302b");
  expect(darkTheme.colors.userBubble).toBe("#694873");
  expect(darkTheme.colors.background).not.toBe(darkTheme.colors.card);
  expect(lum(darkTheme.colors.background)).toBeLessThan(lum(darkTheme.colors.card));
  expect(lum(darkTheme.colors.card)).toBeLessThan(lum(darkTheme.colors.popover));
});

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

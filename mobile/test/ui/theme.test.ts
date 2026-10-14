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

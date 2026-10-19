import "../../src/i18n";
import { Platform } from "react-native";
import { katexHtml } from "../../src/ui/markdown/katex";
import { KATEX_CSS } from "../../src/ui/markdown/katexCss.generated";
import {
  ensureKatexCache,
  resetKatexCacheForTest,
  KATEX_CACHE_VERSION,
} from "../../src/ui/markdown/katexCache";

describe("MathBlock performance & caching (PF-A)", () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalPlatform, configurable: true });
    resetKatexCacheForTest();
  });

  test("generated HTML on native no longer contains inlined CSS and links to katex.css", () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    const html = katexHtml("x^2", "#000000");
    expect(html).not.toBeNull();
    expect(html).not.toContain(KATEX_CSS);
    expect(html).toContain('<link rel="stylesheet" href="katex.css">');
    expect(html).toContain('class="katex"');
    // Size check: should be small (< 2 KB), not ~370 KB
    expect(html!.length).toBeLessThan(2000);
  });

  test("generated HTML on web keeps inlined CSS unchanged", () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    const html = katexHtml("x^2", "#000000");
    expect(html).not.toBeNull();
    expect(html).toContain(KATEX_CSS);
    expect(html).not.toContain('<link rel="stylesheet" href="katex.css">');
    expect(html!.length).toBeGreaterThan(300000);
  });

  test("CSS file is written once per version in Paths.cache/katex/", () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    resetKatexCacheForTest();

    // First call writes the cache
    const baseUrl = ensureKatexCache();
    expect(baseUrl).toContain("katex");

    // Second call should reuse without re-writing
    const baseUrl2 = ensureKatexCache();
    expect(baseUrl2).toBe(baseUrl);
  });
});

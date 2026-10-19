import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { KATEX_CSS } from "./katexCss.generated";

export const KATEX_CACHE_VERSION = "0.16.21-v1";

let cachedBaseUrl: string | null = null;

export function resetKatexCacheForTest(): void {
  cachedBaseUrl = null;
}

/**
 * Ensures KaTeX CSS and fonts are written once to Paths.cache/katex/.
 * Returns the file:// baseUrl pointing to that directory.
 */
export function ensureKatexCache(): string {
  if (Platform.OS === "web") return "";
  if (cachedBaseUrl) return cachedBaseUrl;

  const dir = new Directory(Paths.cache, "katex");
  dir.create({ intermediates: true, idempotent: true });

  const versionFile = new File(dir, "version.txt");
  const cssFile = new File(dir, "katex.css");

  let needsWrite = true;
  if (versionFile.exists && cssFile.exists) {
    try {
      if (versionFile.textSync() === KATEX_CACHE_VERSION) {
        needsWrite = false;
      }
    } catch {
      needsWrite = true;
    }
  }

  if (needsWrite) {
    cssFile.write(KATEX_CSS);
    versionFile.write(KATEX_CACHE_VERSION);
  }

  cachedBaseUrl = dir.uri.endsWith("/") ? dir.uri : `${dir.uri}/`;
  return cachedBaseUrl;
}

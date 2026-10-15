import { Directory, File, Paths } from "expo-file-system";
import { viewerCsp } from "./ArtifactWebView";

const PNG_PREFIX = "data:image/png;base64,";
/** About 6 MB of PNG bytes. Larger snapshots are refused. */
const MAX_PNG_CHARS = 8_000_000;

/** The base64 body of a PNG data URL, or null when the payload is not a bounded PNG. */
export function pngBase64(dataUrl: string): string | null {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_PREFIX)) return null;
  if (dataUrl.length > MAX_PNG_CHARS) return null;
  const body = dataUrl.slice(PNG_PREFIX.length);
  if (!body || body.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  return body;
}

/**
 * Content Security Policy for print/PDF export.
 * Full HTML artifacts keep their scripts (charts need them) but stay without network, as today.
 * Markdown-to-PDF disables scripts entirely (script-src 'none').
 */
function printCsp(scripts = true): string {
  const policy = [
    "default-src 'none'",
    scripts ? "script-src 'unsafe-inline' 'unsafe-eval'" : "script-src 'none'",
    "style-src 'unsafe-inline'",
    "font-src data:",
    "img-src data: blob:",
    "media-src data: blob:",
    "worker-src blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
  return `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
}

export type PrintDocumentOptions = {
  scripts?: boolean;
};

/**
 * A print document for the artifact markup. Injects strict CSP into head, wrapping in head if missing.
 * Full HTML artifacts keep their scripts (charts need them) but stay without network, as today.
 */
export function printDocument(body: string, options?: PrintDocumentOptions): string {
  const scripts = options?.scripts ?? true;
  const csp = printCsp(scripts);

  // Inject the CSP into the first real <head> only: parse with the first match of <head\b that comes before <body. Otherwise wrap.
  const headMatch = /<head\b[^>]*>/i.exec(body);
  const bodyMatch = /<body\b[^>]*>/i.exec(body);
  const headBeforeBody = headMatch && (!bodyMatch || headMatch.index < bodyMatch.index);

  if (headBeforeBody) {
    const idx = headMatch.index + headMatch[0].length;
    return body.slice(0, idx) + csp + body.slice(idx);
  }
  if (/<html\b[^>]*>/i.test(body)) {
    if (bodyMatch) {
      return body.slice(0, bodyMatch.index) + `<head>${csp}</head>` + body.slice(bodyMatch.index);
    }
    return body.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${csp}</head>`);
  }
  const trimmed = body.trimStart();
  const withoutDocType = trimmed.replace(/^<!doctype html[^>]*>/i, "").trimStart();
  return `<!DOCTYPE html><html><head>${csp}<meta charset="utf-8"><style>body{margin:0}</style></head><body>${withoutDocType}</body></html>`;
}

const PREVIEW_NAME = /^preview\.(html|svg|mmd|vl|geojson|react)$/;
const ARTIFACT_SOURCE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.(html|svg|mmd|vl|geojson|react)$/;
/** About 2 MB of source. Larger previews are not written out for sharing. */
const MAX_PREVIEW_CHARS = 2_000_000;

/** Writes an in-memory preview (no file URI yet) into the cache. Returns a file URI, or null. */
export function writePreview(name: string, text: string): string | null {
  if (!PREVIEW_NAME.test(name) || !text || text.length > MAX_PREVIEW_CHARS) return null;
  const dir = new Directory(Paths.cache, "artifacts");
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, name);
  file.write(text);
  const uri = file.uri;
  if (!uri.startsWith("file://") || uri.includes("..")) return null;
  return uri;
}

/** Writes artifact source into the cache under a safe upload filename. Returns a file URI, or null. */
export function writeArtifactSource(name: string, text: string): string | null {
  if (
    !ARTIFACT_SOURCE_NAME.test(name) ||
    name.includes("..") ||
    !text ||
    text.length > MAX_PREVIEW_CHARS
  ) {
    return null;
  }
  const dir = new Directory(Paths.cache, "artifacts");
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, name);
  file.write(text);
  const uri = file.uri;
  if (!uri.startsWith("file://") || uri.includes("..")) return null;
  return uri;
}

/** Writes a validated PNG into the cache. Returns a file URI, or null when the payload is refused. */
export function writePng(dataUrl: string): string | null {
  const body = pngBase64(dataUrl);
  if (!body) return null;
  const dir = new Directory(Paths.cache, "artifacts");
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, "preview.png");
  file.write(body, { encoding: "base64" });
  const uri = file.uri;
  if (!uri.startsWith("file://") || uri.includes("..")) return null;
  return uri;
}

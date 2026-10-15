import { Directory, File, Paths } from "expo-file-system";

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

/** A print document for the artifact markup. A full HTML document is left as the author wrote it. */
export function printDocument(body: string): string {
  const trimmed = body.trimStart();
  if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return body;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${body}</body></html>`;
}

const PREVIEW_NAME = /^preview\.(html|svg|mmd|vl)$/;
const ARTIFACT_SOURCE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.(html|svg|mmd|vl)$/;
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

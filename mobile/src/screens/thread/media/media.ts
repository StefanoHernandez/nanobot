import { Directory, File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy"; // only exists in /legacy on SDK 57
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import type { UIMediaAttachment } from "@/lib/types";

const FLAG_GRANT_READ_URI_PERMISSION = 1;

export type MediaClass = "image" | "video" | "audio" | "file";

const AUDIO = ["mp3", "m4a", "ogg", "opus", "wav", "aac", "flac", "amr", "weba"];
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  html: "text/html",
  zip: "application/zip",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** File name for display; falls back to the last url path segment (query/hash stripped). */
export function mediaName(m: UIMediaAttachment): string {
  if (m.name) return m.name;
  const seg = (m.url ?? "").split(/[?#]/)[0].split("/").pop() ?? "";
  try { return decodeURIComponent(seg); } catch { return seg; }
}

export const extOf = (m: UIMediaAttachment): string => {
  const n = m.name ?? mediaName(m);
  const i = n.lastIndexOf(".");
  return i < 0 ? "" : n.slice(i + 1).toLowerCase();
};

export function classify(m: UIMediaAttachment): MediaClass {
  if (m.kind === "file" && AUDIO.includes(extOf(m))) return "audio";
  return m.kind;
}

export function absoluteMediaUrl(baseUrl: string, url: string): string {
  if (/^(https?:|data:|file:|content:)/i.test(url)) return url;
  return baseUrl.replace(/\/+$/, "") + "/" + url.replace(/^\/+/, "");
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

/** Safe single path segment: no separators, never "", "." or "..". Keeps the extension. */
export function safeName(name: string): string {
  const n = name.replace(/[\\/]/g, "_").trim();
  return /^\.*$/.test(n) ? "file" : n;
}

/** Download to cache/media/<hash>/<name>, reusing a previous complete download. Returns the local file uri.
 * Downloads go to <name>.part and are moved into place only on success (Android may leave a partial file). */
export async function downloadMedia(url: string, name: string): Promise<string> {
  const dir = new Directory(Paths.cache, "media", hash(url));
  dir.create({ intermediates: true, idempotent: true });
  const n = safeName(name);
  const target = new File(dir, n);
  if (target.exists) return target.uri;
  const part = new File(dir, n + ".part");
  try {
    await File.downloadFileAsync(url, part, { idempotent: true }); // rejects on non-2xx (SDK 57 docs)
    await part.move(target, { overwrite: true });
  } catch (e) {
    try { if (part.exists) part.delete(); } catch { /* best effort */ }
    throw e;
  }
  return target.uri;
}

export async function shareMedia(localUri: string): Promise<void> {
  await Sharing.shareAsync(localUri);
}

/** System viewer via ACTION_VIEW; falls back to the share sheet when no app can handle it. */
export async function openLocal(localUri: string, ext: string): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: await getContentUriAsync(localUri),
      type: MIME[ext] ?? "*/*",
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
  } catch {
    await shareMedia(localUri);
  }
}

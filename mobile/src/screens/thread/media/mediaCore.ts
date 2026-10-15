import type { UIMediaAttachment } from "@/lib/types";

export type MediaClass = "image" | "video" | "audio" | "file";

const AUDIO = ["mp3", "m4a", "ogg", "opus", "wav", "aac", "flac", "amr", "weba"];

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

/** Safe single path segment: no separators, never "", "." or "..". Keeps the extension. */
export function safeName(name: string): string {
  const n = name.replace(/[\\/]/g, "_").trim();
  return /^\.*$/.test(n) ? "file" : n;
}

/** Browser open. Only http(s): a file URL or a script URL is refused. */
export function openWebUrl(url: string, open: (url: string) => void): void {
  if (!/^https?:\/\//i.test(url)) throw new Error("refused");
  open(url);
}

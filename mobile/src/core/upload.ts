import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { AttachmentReference } from "../../vendor/nanobot/packages/client-events/attachments";
import type { WebUIIngressLimits } from "@/lib/types";
import type { NanobotSession } from "./session";

export type LocalFile = { uri: string; name: string; mime: string; size: number };
export type Limits = WebUIIngressLimits["attachments"];
export type ValidateResult = { ok: true } | { ok: false; reason: "count" | "file_size" | "total_size" | "type"; name?: string };

// Copied by hand from the WebUI useAttachedImages.ts whitelist (vendor map §1). SVG is rejected server-side.
const OFFICE = "application/vnd.openxmlformats-officedocument";
export const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf",
  `${OFFICE}.wordprocessingml.document`, `${OFFICE}.spreadsheetml.sheet`, `${OFFICE}.presentationml.presentation`,
  "text/plain", "text/markdown", "text/csv", "application/json", "application/xml", "text/xml", "text/html",
  "text/x-log", "application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml", "application/toml", "text/x-toml",
  "text/x-ini", "text/ini", "text/x-cfg",
]);

export function validateFiles(files: LocalFile[], limits: Limits): ValidateResult {
  if (files.length > limits.max_count) return { ok: false, reason: "count" };
  let total = 0;
  for (const f of files) {
    if (!ALLOWED_MIME.has(f.mime.toLowerCase())) return { ok: false, reason: "type", name: f.name };
    if (f.size > limits.max_file_bytes) return { ok: false, reason: "file_size", name: f.name };
    total += f.size;
  }
  return total > limits.max_total_bytes ? { ok: false, reason: "total_size" } : { ok: true };
}

/** Re-encodes an oversized raster image as JPEG with shrinking width/quality until it fits maxBytes. */
export async function prepareImage(file: LocalFile, maxBytes: number): Promise<LocalFile> {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.mime)) return file;
  // size 0 = unknown (share intent without size): read the real one, else re-encode and measure.
  let size = file.size;
  if (!size) try { size = new File(file.uri).size; } catch {}
  if (size && size <= maxBytes) return { ...file, size };
  let out = file;
  for (const [width, compress] of [[2048, 0.8], [1280, 0.6], [800, 0.5]] as const) {
    const r = await manipulateAsync(file.uri, [{ resize: { width } }], { compress, format: SaveFormat.JPEG });
    out = { uri: r.uri, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", size: new File(r.uri).size };
    if (out.size <= maxBytes) break;
  }
  return out;
}

/**
 * POSTs each file sequentially to the upload capability of the latest `ready` frame (read at call time).
 * The Expo File is a Blob, so it is streamed as the raw body. Never logs URLs or tokens.
 */
export const UPLOAD_TIMEOUT_MS = 60_000;

export async function uploadFiles(
  session: NanobotSession,
  files: LocalFile[],
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<AttachmentReference[]> {
  const cap0 = session.uploadCapability;
  if (!cap0) throw new Error("upload_unavailable");
  const refs: AttachmentReference[] = [];
  for (const f of files) {
    if (session.uploadCapability !== cap0) throw new Error("upload_unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${session.baseUrl}${cap0.path}`, {
        method: "POST",
        redirect: "error",
        credentials: "omit",
        headers: {
          Authorization: `Bearer ${cap0.token}`,
          "Content-Type": f.mime,
          "X-Attachment-Name": encodeURIComponent(f.name),
        },
        body: new File(f.uri) as unknown as Blob,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`upload_failed_${res.status}`);
      const j = (await res.json()) as { reference?: unknown };
      if (typeof j.reference !== "string") throw new Error("upload_bad_response");
      refs.push({ reference: j.reference, name: f.name });
    } catch (e: any) {
      if (e?.name === "AbortError" || controller.signal.aborted) {
        throw new Error("upload_timed_out");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  return refs;
}

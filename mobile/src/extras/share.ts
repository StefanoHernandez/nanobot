import { router } from "expo-router";
import { File, Paths } from "expo-file-system";
import { createStore, useStore } from "zustand";
import { profiles } from "../core/profiles";
import type { LocalFile } from "../core/upload";
import { i18n } from "../i18n";
import { chatsStore } from "../state/chatsStore";
import { threadStore } from "../state/threadStore";
import { sessionStore } from "../state/sessionStore";
import { DEFAULT_LIMITS } from "../core/session";
import { toast } from "../ui/components";
import { chatPath } from "./notifications";

export type SharedFile = { path: string; mimeType: string; fileName: string; size: number | null };
export type Intent = { type?: string | null; text?: string | null; files?: SharedFile[] | null };

export type PendingShare = { text: string; files: LocalFile[] };

export function mergePendingShare(current: PendingShare | null, incoming: PendingShare): PendingShare {
  if (!current) return incoming;
  const mergedText = [current.text, incoming.text].filter((t) => t && t.trim().length > 0).join("\n\n");
  const seenUris = new Set(current.files.map((f) => f.uri));
  const mergedFiles = [...current.files];
  for (const f of incoming.files) {
    if (!seenUris.has(f.uri)) {
      seenUris.add(f.uri);
      mergedFiles.push(f);
    }
  }
  return { text: mergedText, files: mergedFiles };
}

export type ShareState = {
  pending: PendingShare | null;
  clear(): void;
};

export const shareStore = createStore<ShareState>((set) => ({
  pending: null,
  clear: () => set({ pending: null }),
}));

export const useShare = <T = ShareState>(selector: (s: ShareState) => T = (s) => s as never): T =>
  useStore(shareStore, selector);

export type ShareDeps = {
  hasProfile(): boolean;
  newChat(): Promise<string>;
  navigate(path: string): void;
  setDraft(key: string, text: string): void;
  setPendingFiles(key: string, files: LocalFile[]): void;
  toast(msg: string): void;
  openPicker?: (payload: PendingShare) => void;
  pickChat?: boolean;
};

const real: ShareDeps = {
  hasProfile: () => !!profiles.activeId(),
  newChat: () => chatsStore.getState().newChat(),
  navigate: (p) => router.push(p as never),
  setDraft: (k, t) => threadStore.getState().setDraft(k, t),
  setPendingFiles: (k, f) => threadStore.getState().setPendingFiles(k, f),
  toast: (m) => toast.show(m),
  openPicker: (p) => {
    const cur = shareStore.getState().pending;
    shareStore.setState({ pending: mergePendingShare(cur, p) });
  },
};

/**
 * expo-share-intent copies every content:// share into the root of the app cache dir, so a legitimate
 * shared file is always a direct child of it. Anything else (a raw file:// path from another app, e.g.
 * pointing at one of our private files or a cache subfolder with downloaded media) is refused.
 */
export function isSharedPathAllowed(path: string, cacheUri: string = Paths.cache?.uri ?? "file:///cache"): boolean {
  const strip = (p: string) => p.replace(/^file:\/\//, "").replace(/\/+$/, "");
  const file = strip(path);
  if (!file.startsWith("/") || /(^|\/)\.\.?(\/|$)/.test(file)) return false;
  return file.slice(0, file.lastIndexOf("/")) === strip(cacheUri);
}

function sizeOf(path: string): number {
  try {
    return new File(path.startsWith("/") ? `file://${path}` : path).size || 0;
  } catch {
    return 0;
  }
}

export async function applyShareToChat(
  targetKey: string | "new",
  payload: PendingShare,
  d: ShareDeps = real,
): Promise<void> {
  try {
    const key = targetKey === "new" ? await d.newChat() : targetKey;
    d.navigate(chatPath(key));
    if (payload.text) {
      const existingDraft = threadStore.getState().threads[key]?.draft;
      if (targetKey !== "new" && existingDraft?.trim()) {
        d.setDraft(key, `${existingDraft}\n\n${payload.text}`);
      } else {
        d.setDraft(key, payload.text);
      }
    }
    if (payload.files.length) {
      const existingPending = threadStore.getState().threads[key]?.pendingFiles ?? [];
      d.setPendingFiles(key, [...existingPending, ...payload.files]);
    }
    shareStore.getState().clear();
  } catch {
    d.toast(i18n.t("extras.shareFailed"));
  }
}

/** Text goes to the draft, shared files to pendingFiles (chips); nothing is sent. */
export async function handleShare(intent: Intent, d: ShareDeps = real): Promise<void> {
  if (!d.hasProfile()) {
    d.toast(i18n.t("extras.noProfile"));
    d.navigate("/connect");
    return;
  }
  const text = intent.text?.trim() || "";
  const limits = sessionStore.getState().session?.limits ?? DEFAULT_LIMITS;
  const rawFiles = intent.files ?? [];
  const files: LocalFile[] = [];
  let hadOversized = false;
  for (const f of rawFiles) {
    if (!isSharedPathAllowed(f.path)) continue;
    const name = f.fileName || "file";
    const size = f.size ?? sizeOf(f.path);
    // Images are re-encoded to fit at send time (prepareImage), as from the composer: don't drop them here.
    if (size > limits.max_file_bytes && !(f.mimeType || "").startsWith("image/")) {
      hadOversized = true;
      d.toast(i18n.t("extras.shareTooLarge", { name }));
      continue;
    }
    files.push({
      uri: f.path.startsWith("/") ? `file://${f.path}` : f.path,
      name,
      mime: f.mimeType || "application/octet-stream",
      size,
    });
  }

  if (!text && !files.length) {
    if (!hadOversized) {
      d.toast(i18n.t("extras.shareFailed"));
    }
    return;
  }
  const payload: PendingShare = { text, files };
  if (d.pickChat !== false && d.openPicker) {
    d.openPicker(payload);
    return;
  }
  await applyShareToChat("new", payload, d);
}

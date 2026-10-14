import { router } from "expo-router";
import { File } from "expo-file-system";
import { createStore, useStore } from "zustand";
import { profiles } from "../core/profiles";
import type { LocalFile } from "../core/upload";
import { i18n } from "../i18n";
import { chatsStore } from "../state/chatsStore";
import { threadStore } from "../state/threadStore";
import { toast } from "../ui/components";
import { chatPath } from "./notifications";

export type SharedFile = { path: string; mimeType: string; fileName: string; size: number | null };
export type Intent = { type?: string | null; text?: string | null; files?: SharedFile[] | null };

export type PendingShare = { text: string; files: LocalFile[] };

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
  openPicker: (p) => shareStore.setState({ pending: p }),
};

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
  const files: LocalFile[] = (intent.files ?? []).map((f) => ({
    uri: f.path.startsWith("/") ? `file://${f.path}` : f.path,
    name: f.fileName || "file",
    mime: f.mimeType || "application/octet-stream",
    size: f.size ?? sizeOf(f.path),
  }));
  if (!text && !files.length) {
    d.toast(i18n.t("extras.shareFailed"));
    return;
  }
  const payload: PendingShare = { text, files };
  if (d.pickChat !== false && d.openPicker) {
    d.openPicker(payload);
    return;
  }
  await applyShareToChat("new", payload, d);
}

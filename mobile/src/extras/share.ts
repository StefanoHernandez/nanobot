import { router } from "expo-router";
import { profiles } from "../core/profiles";
import { i18n } from "../i18n";
import { chatsStore } from "../state/chatsStore";
import { File } from "expo-file-system";
import type { LocalFile } from "../core/upload";
import { threadStore } from "../state/threadStore";
import { toast } from "../ui/components";
import { chatPath } from "./notifications";

type SharedFile = { path: string; mimeType: string; fileName: string; size: number | null };
type Intent = { type?: string | null; text?: string | null; files?: SharedFile[] | null };
export type ShareDeps = {
  hasProfile(): boolean;
  newChat(): Promise<string>;
  navigate(path: string): void;
  setDraft(key: string, text: string): void;
  setPendingFiles(key: string, files: LocalFile[]): void;
  toast(msg: string): void;
};

const real: ShareDeps = {
  hasProfile: () => !!profiles.activeId(),
  newChat: () => chatsStore.getState().newChat(),
  navigate: (p) => router.push(p as never),
  setDraft: (k, t) => threadStore.getState().setDraft(k, t),
  setPendingFiles: (k, f) => threadStore.getState().setPendingFiles(k, f),
  toast: (m) => toast.show(m),
};

function sizeOf(path: string): number {
  try {
    return new File(path.startsWith("/") ? `file://${path}` : path).size || 0;
  } catch {
    return 0;
  }
}

/** Text goes to the draft, shared files to pendingFiles (chips); nothing is sent. The caller must have an open session (newChat needs it) unless no profile exists. */
export async function handleShare(intent: Intent, d: ShareDeps = real): Promise<void> {
  if (!d.hasProfile()) {
    d.toast(i18n.t("extras.noProfile"));
    d.navigate("/connect");
    return;
  }
  const text = intent.type === "text" || intent.type === "weburl" ? intent.text?.trim() : "";
  const files: LocalFile[] = (intent.files ?? []).map((f) => ({
    uri: f.path.startsWith("/") ? `file://${f.path}` : f.path,
    name: f.fileName,
    mime: f.mimeType,
    size: f.size ?? sizeOf(f.path),
  }));
  if (!text && !files.length) return d.toast(i18n.t("extras.shareFailed"));
  try {
    const key = await d.newChat();
    d.navigate(chatPath(key));
    if (text) d.setDraft(key, text);
    if (files.length) d.setPendingFiles(key, files);
  } catch {
    d.toast(i18n.t("extras.shareFailed"));
  }
}

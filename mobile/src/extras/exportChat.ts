import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { NanobotSession } from "../core/session";
import { threadStore } from "../state/threadStore";
import type { UIMessage } from "@/lib/types";
import { chatsStore } from "../state/chatsStore";
import type { ProjectDetail } from "../projects/api";
import { Marked } from "marked";
import { i18n } from "../i18n";

export type ExportFormat = "md" | "pdf";

export type ChatToMarkdownOptions = {
  includeTools?: boolean;
  now?: Date;
  headingLevel?: 1 | 2;
};

export function slugifyName(input: string): string {
  const s = (input || "export")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return s || "export";
}

export function formatExportDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatMessageTime(createdAt?: number): string {
  if (!createdAt || isNaN(createdAt)) return "";
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${min}`;
  } catch {
    return "";
  }
}

function extractToolNames(m: UIMessage): string[] {
  const names: string[] = [];
  if (m.toolEvents?.length) {
    for (const te of m.toolEvents) {
      if (te.name) names.push(te.name);
    }
  }
  if (names.length === 0 && m.traces?.length) {
    for (const tr of m.traces) {
      const text = typeof tr === "string" ? tr : (tr as { content?: string }).content ?? "";
      const token = text.trim().split(/[\s(]+/)[0];
      if (token) names.push(token);
    }
  }
  if (names.length === 0 && m.kind === "trace" && m.content) {
    const token = m.content.trim().split(/[\s(]+/)[0];
    if (token) names.push(token);
  }
  return names;
}

function extractAttachmentNames(m: UIMessage): string[] {
  const names: string[] = [];
  if (m.media?.length) {
    for (const item of m.media) {
      const url = item.url ?? "";
      const name = item.name || url.split("/").pop() || "file";
      names.push(name);
    }
    return names;
  }
  if (m.images?.length) {
    for (const img of m.images) {
      const url = typeof img === "string" ? img : img.url ?? "";
      const name = (typeof img === "object" && img.name) || url.split("/").pop()?.split("?")[0] || "image";
      names.push(name);
    }
  }
  return names;
}

/**
 * Pure helper converting a chat title and messages into a clean Markdown document.
 * By default, tool traces and thinking/reasoning are omitted.
 */
export function chatToMarkdown(
  title: string,
  messages: UIMessage[],
  opts?: ChatToMarkdownOptions,
): string {
  const includeTools = opts?.includeTools ?? false;
  const now = opts?.now ?? new Date();
  const headingPrefix = opts?.headingLevel === 2 ? "##" : "#";
  const safeTitle = title?.trim() || i18n.t("chats.untitled");
  const exportedDateStr = formatExportDate(now);

  const lines: string[] = [
    `${headingPrefix} ${safeTitle}`,
    "",
    `_${i18n.t("export.exportedAt", { date: exportedDateStr })}_`,
  ];

  for (const m of messages) {
    if (m.activityKind === "model") continue;

    if (m.kind === "trace") {
      if (includeTools) {
        const toolNames = extractToolNames(m);
        if (toolNames.length > 0) {
          lines.push("");
          for (const name of toolNames) {
            lines.push(`> tool: ${name}`);
          }
        }
      }
      continue;
    }

    if (m.role !== "user" && m.role !== "assistant") continue;

    const toolNames = includeTools ? extractToolNames(m) : [];
    const attachments = extractAttachmentNames(m);
    const body = (m.content ?? "").trim();

    // Skip reasoning-only assistant messages that have no visible text, attachments, or included tools
    if (!body && attachments.length === 0 && toolNames.length === 0) {
      continue;
    }

    const speaker = m.role === "user" ? "**Tu**" : "**nanobot**";
    const timeStr = formatMessageTime(m.createdAt);
    const header = timeStr ? `${speaker} (${timeStr})` : speaker;

    lines.push("", header);

    for (const name of toolNames) {
      lines.push(`> tool: ${name}`);
    }

    for (const attName of attachments) {
      lines.push(`[file: ${attName}]`);
    }

    if (body) {
      lines.push("", body);
    }
  }

  return lines.join("\n") + "\n";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportMarkdownToHtml(markdown: string): string {
  const markedInstance = new Marked().use({
    renderer: {
      html({ text }) {
        return escapeHtml(text);
      },
      image({ href, text, title }) {
        if (href && href.startsWith("data:")) {
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
          const altAttr = text ? ` alt="${escapeHtml(text)}"` : "";
          return `<img src="${href}"${altAttr}${titleAttr} />`;
        }
        return `[image: ${text || ""}]`;
      },
    },
  });

  const bodyHtml = markedInstance.parse(markdown, { async: false }) as string;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`;
  return `<!DOCTYPE html><html><head>${csp}<meta charset="utf-8"></head><body style="margin:24px;font-family:sans-serif;line-height:1.5">${bodyHtml}</body></html>`;
}

export async function ensureChatMessages(
  session: NanobotSession,
  chatKey: string,
): Promise<UIMessage[]> {
  const existing = threadStore.getState().threads[chatKey];
  if (existing?.loaded && !existing.loadError) {
    return existing.messages;
  }
  await threadStore.getState().load(session, chatKey);
  const thread = threadStore.getState().threads[chatKey];
  if (!thread?.loaded || thread.loadError) {
    throw new Error("thread_load_failed");
  }
  return thread.messages;
}

export async function shareMarkdown(
  title: string,
  markdown: string,
  format: ExportFormat,
  now: Date = new Date(),
): Promise<string> {
  if (format === "pdf") {
    const html = exportMarkdownToHtml(markdown);
    const res = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(res.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });
    return res.uri;
  }

  const slug = slugifyName(title);
  const dateStr = formatExportDate(now);
  const filename = `${slug}-${dateStr}.md`;
  const dir = new Directory(Paths.cache, "exports");
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, filename);
  file.write(markdown);
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/markdown",
  });
  return file.uri;
}

export async function exportChat(params: {
  session: NanobotSession;
  chatKey: string;
  title: string;
  format: ExportFormat;
  includeTools?: boolean;
  now?: Date;
}): Promise<string> {
  const messages = await ensureChatMessages(params.session, params.chatKey);
  const md = chatToMarkdown(params.title, messages, {
    includeTools: params.includeTools,
    now: params.now,
  });
  return shareMarkdown(params.title, md, params.format, params.now);
}

export function projectToMarkdown(
  detail: ProjectDetail,
  chatSections: { title: string; messages: UIMessage[] }[],
  opts?: { includeTools?: boolean; now?: Date },
): string {
  const now = opts?.now ?? new Date();
  const lines: string[] = [
    `# ${detail.project.name}`,
    "",
    `_${i18n.t("export.exportedAt", { date: formatExportDate(now) })}_`,
  ];

  if (detail.project.description?.trim()) {
    lines.push("", detail.project.description.trim());
  }

  lines.push("", `## ${i18n.t("projects.instructions")}`);
  if (detail.instructions?.trim()) {
    lines.push("", detail.instructions.trim());
  } else {
    lines.push("", `_${i18n.t("projects.instructionsEmpty")}_`);
  }

  lines.push("", `## ${i18n.t("projects.files")}`);
  if (detail.files.length === 0) {
    lines.push("", `_${i18n.t("projects.emptyFiles")}_`);
  } else {
    lines.push("");
    for (const f of detail.files) {
      lines.push(`- \`${f.path}\` (${formatByteSize(f.size)})`);
    }
  }

  lines.push("", `## ${i18n.t("projects.chats")}`);
  if (chatSections.length === 0) {
    lines.push("", `_${i18n.t("projects.emptyChats")}_`);
  } else {
    for (const section of chatSections) {
      lines.push(
        "",
        "---",
        "",
        chatToMarkdown(section.title, section.messages, {
          includeTools: opts?.includeTools,
          now,
          headingLevel: 2,
        }).trim(),
      );
    }
  }

  return lines.join("\n") + "\n";
}

const MAX_PROJECT_EXPORT_CHATS = 30;

export async function exportProject(params: {
  session: NanobotSession;
  detail: ProjectDetail;
  format: ExportFormat;
  onProgress?: (current: number, total: number) => void;
  isCancelled?: () => boolean;
  now?: Date;
}): Promise<string | null> {
  const { session, detail, format, onProgress, isCancelled, now } = params;
  const allChats = chatsStore.getState().chats;
  const projectChats = allChats
    .filter((c) => c.workspaceScope?.project_path === detail.project.path)
    .slice(0, MAX_PROJECT_EXPORT_CHATS);

  const total = projectChats.length;
  const chatSections: { title: string; messages: UIMessage[] }[] = [];

  for (let i = 0; i < total; i++) {
    if (isCancelled?.()) return null;
    onProgress?.(i + 1, total);
    const chat = projectChats[i];
    const messages = await ensureChatMessages(session, chat.key);
    if (isCancelled?.()) return null;
    chatSections.push({
      title: chat.title || i18n.t("chats.untitled"),
      messages,
    });
  }

  if (isCancelled?.()) return null;
  const md = projectToMarkdown(detail, chatSections, { now });
  return shareMarkdown(detail.project.name, md, format, now);
}

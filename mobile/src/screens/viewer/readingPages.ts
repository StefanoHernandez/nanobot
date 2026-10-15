import { marked } from "marked";
import { printDocument } from "./exportArtifact";

const MAX_PAGE_CHARS = 2400;
const HEADING_START = /^#{1,3} /;
const FENCE_MARK = /^ {0,3}(`{3,}|~{3,})/;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function splitByHeadings(text: string): string[] {
  const lines = text.split("\n");
  const sections: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    const mark = FENCE_MARK.exec(line);
    if (mark) {
      const token = mark[1][0];
      fence = fence === token ? null : fence ?? token;
      current.push(line);
      continue;
    }
    if (!fence && HEADING_START.test(line) && current.length > 0) {
      sections.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current.join("\n"));
  return sections.length ? sections : [""];
}

function splitLongSection(section: string): string[] {
  if (section.length <= MAX_PAGE_CHARS) return [section];

  const blocks = section.split(/(\n\s*\n)/);
  const pages: string[] = [];
  let chunk = "";

  const flush = () => {
    if (chunk.length > 0) {
      pages.push(chunk);
      chunk = "";
    }
  };

  for (const block of blocks) {
    if (!block) continue;
    const piece = block;
    if (piece.length > MAX_PAGE_CHARS) {
      flush();
      let start = 0;
      while (start < piece.length) {
        pages.push(piece.slice(start, start + MAX_PAGE_CHARS));
        start += MAX_PAGE_CHARS;
      }
      continue;
    }
    const next = chunk ? chunk + piece : piece;
    if (next.length <= MAX_PAGE_CHARS) {
      chunk = next;
    } else {
      flush();
      chunk = piece;
    }
  }
  flush();
  return pages.length ? pages : [section];
}

/** Splits markdown into reading pages (headings, then blank-line chunks within size limits). */
export function paginateMarkdown(text: string): string[] {
  const normalized = normalizeNewlines(text);
  if (!normalized.trim()) return [""];

  const sections = splitByHeadings(normalized);
  const pages: string[] = [];
  for (const section of sections) {
    pages.push(...splitLongSection(section));
  }
  return pages.length ? pages : [""];
}

function stripDangerousHtml(html: string): string {
  let out = html;
  out = out.replace(/<\s*(script|iframe|object|embed|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  out = out.replace(/<\s*(script|iframe|object|embed|link)\b[^>]*\/?>/gi, "");
  out = out.replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\s(href|src)\s*=\s*("|')?\s*(javascript:|data:)[^"'>\s]*/gi, ' $1="#"');
  return out;
}

/** Full-document markdown as a sanitized HTML print payload for expo-print. */
export function markdownToPrintHtml(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  const safe = stripDangerousHtml(raw);
  return printDocument(safe);
}

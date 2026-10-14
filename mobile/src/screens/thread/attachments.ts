import type { LocalFile } from "../../core/upload";

export type RawPickerAsset = {
  uri: string;
  name?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  type?: string | null;
  size?: number | null;
  fileSize?: number | null;
};

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  log: "text/x-log",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  ini: "text/x-ini",
  cfg: "text/x-cfg",
};

export function inferMimeType(filename: string, fallbackType?: string | null): string {
  const dot = filename.lastIndexOf(".");
  if (dot >= 0) {
    const ext = filename.slice(dot + 1).toLowerCase();
    if (EXT_TO_MIME[ext]) {
      return EXT_TO_MIME[ext];
    }
  }
  if (fallbackType === "image") {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

export function toLocalFile(asset: RawPickerAsset): LocalFile {
  const name =
    asset.name ||
    asset.fileName ||
    asset.uri.split("/").pop()?.split("?")[0] ||
    "file";
  const mime = asset.mimeType || inferMimeType(name, asset.type);
  const size = asset.size ?? asset.fileSize ?? 0;
  return {
    uri: asset.uri,
    name,
    mime,
    size,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}

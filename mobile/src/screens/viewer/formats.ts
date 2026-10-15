export type ViewerKind =
  | "markdown"
  | "code"
  | "json"
  | "csv"
  | "text"
  | "html"
  | "svg"
  | "mermaid"
  | "chart"
  | "map"
  | "react"
  | "pdf"
  | "docx"
  | "pptx"
  | "xlsx"
  | null;

const CODE_EXTS = new Set([
  "py", "js", "ts", "tsx", "jsx", "sh", "yaml", "yml", "toml",
  "css", "sql", "go", "rs", "java", "kt", "c", "cpp",
  "h", "rb", "php", "xml", "ini", "env",
]);

/** Returns the viewer kind for a given file name, or null if it should open externally. */
export function viewerKind(name: string): ViewerKind {
  const ext = langOf(name);
  if (!ext) return null;

  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "json") return "json";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "txt" || ext === "log") return "text";

  // Artifacts & document preview formats (P5-V1)
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "svg") return "svg";
  if (ext === "mmd" || ext === "mermaid") return "mermaid";
  if (ext === "vl") return "chart";
  if (ext === "geojson") return "map";
  if (ext === "react") return "react";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "xlsx" || ext === "xls") return "xlsx";

  if (CODE_EXTS.has(ext)) return "code";

  return null;
}

/** Returns the extension without the leading dot, lowercased. */
export function langOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/**
 * Parses CSV/TSV text handling quoted fields with delimiters, newlines, and escaped quotes ("").
 */
export function parseCsv(text: string, sep: string = ","): string[][] {
  // Strip leading BOM if present
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let hasField = false; // whether a field (even empty) has started in current position
  let i = 0;

  const pushRowIfNotEmpty = (row: string[]) => {
    // Drop completely empty lines: a row with 0 fields or a single empty field
    if (row.length === 0) return;
    if (row.length === 1 && row[0] === "") return;
    rows.push(row);
  };

  while (i < cleanText.length) {
    const char = cleanText[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < cleanText.length && cleanText[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        hasField = true;
        i++;
        continue;
      } else if (char === sep) {
        currentRow.push(currentField);
        currentField = "";
        hasField = false;
        i++;
        continue;
      } else if (char === "\r") {
        if (i + 1 < cleanText.length && cleanText[i + 1] === "\n") {
          i++;
        }
        currentRow.push(currentField);
        currentField = "";
        hasField = false;
        pushRowIfNotEmpty(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField);
        currentField = "";
        hasField = false;
        pushRowIfNotEmpty(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        hasField = true;
        i++;
        continue;
      }
    }
  }

  // Push remainder if there was any field or preceding delimiter in currentRow
  if (hasField || currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    pushRowIfNotEmpty(currentRow);
  }

  return rows;
}

/** Formats JSON nicely with 2 spaces indent; returns original text on parse failure. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

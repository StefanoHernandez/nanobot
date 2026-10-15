import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

import mermaid from "../../../assets/viewers/mermaid.min.vendorjs";
import pdfjs from "../../../assets/viewers/pdfjs.min.vendorjs";
import pdfjsWorker from "../../../assets/viewers/pdfjs-worker.min.vendorjs";
import jszip from "../../../assets/viewers/jszip.min.vendorjs";
import pako from "../../../assets/viewers/pako.min.vendorjs";
import docxPreview from "../../../assets/viewers/docx-preview.min.vendorjs";
import pptxPreview from "../../../assets/viewers/pptx-preview.umd.min.vendorjs";
import xlsx from "../../../assets/viewers/xlsx.full.min.vendorjs";
import vega from "../../../assets/viewers/vega.min.vendorjs";
import vegaLite from "../../../assets/viewers/vega-lite.min.vendorjs";
import vegaEmbed from "../../../assets/viewers/vega-embed.min.vendorjs";

/** Pinned copies of the preview libraries. Bytes live in mobile/assets/viewers. */
export const VIEWER_LIB_NAMES = [
  "mermaid",
  "pdfjs",
  "pdfjsWorker",
  "jszip",
  "pako",
  "docxPreview",
  "pptxPreview",
  "xlsx",
  "vega",
  "vegaLite",
  "vegaEmbed",
] as const;

export type ViewerLibName = (typeof VIEWER_LIB_NAMES)[number];
export type ViewerLibMap = Partial<Record<ViewerLibName, string>>;

const MODULES: Record<ViewerLibName, number> = {
  mermaid,
  pdfjs,
  pdfjsWorker,
  jszip,
  pako,
  docxPreview,
  pptxPreview,
  xlsx,
  vega,
  vegaLite,
  vegaEmbed,
};

const memory = new Map<ViewerLibName, string>();

// Tests render the viewer without the multi-megabyte assets. An empty string
// means "present, but do not inject". Production never stores an empty string.
// `jest` is a Jest vm global; it is not a property of globalThis.
if (typeof jest !== "undefined") {
  for (const name of VIEWER_LIB_NAMES) memory.set(name, "");
}

/** Libraries already read this session, or null if any name is still on disk. */
export function takeCached(names: readonly ViewerLibName[]): ViewerLibMap | null {
  const out: ViewerLibMap = {};
  for (const name of names) {
    const hit = memory.get(name);
    if (hit == null) return null;
    out[name] = hit;
  }
  return out;
}

export async function loadViewerLibs(names: readonly ViewerLibName[]): Promise<ViewerLibMap> {
  const out: ViewerLibMap = {};
  await Promise.all(
    names.map(async (name) => {
      out[name] = await readViewerLib(name);
    }),
  );
  return out;
}

async function readViewerLib(name: ViewerLibName): Promise<string> {
  const hit = memory.get(name);
  if (hit != null && hit.length > 0) return hit;
  const asset = Asset.fromModule(MODULES[name]);
  if (!asset.localUri) await asset.downloadAsync();
  const uri = asset.localUri;
  if (!uri) throw new Error(`viewer library unavailable: ${name}`);
  const text = await FileSystem.readAsStringAsync(uri);
  memory.set(name, text);
  return text;
}

/** Inline a classic script. Breaks a literal `</script>` so it cannot close the tag. */
export function inlineScript(source: string | undefined): string {
  if (!source) return "";
  return `<script>${source.replace(/<\/script/gi, "<\\/script")}</script>`;
}

/** A JS string literal safe to embed in a `<script>` tag (escapes `<`). */
export function jsStringLiteral(source: string): string {
  return JSON.stringify(source).replace(/</g, "\\u003c");
}

// Pins the preview libraries into mobile/assets/viewers so the APK never
// fetches them at view time. Re-run after changing CDN_VERSIONS.
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = new URL("../assets/viewers/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const files = {
  "mermaid.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js",
  "pdfjs.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  "pdfjs-worker.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  "jszip.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "pako.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js",
  "docx-preview.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/docx-preview@0.3.3/dist/docx-preview.min.js",
  "pptx-preview.umd.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/pptx-preview@1.0.7/dist/pptx-preview.umd.min.js",
  "xlsx.full.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "vega.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/vega@6.4.0/build/vega.min.js",
  "vega-lite.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/vega-lite@6.5.0/build/vega-lite.min.js",
  "vega-embed.min.vendorjs":
    "https://cdn.jsdelivr.net/npm/vega-embed@7.3.0/build/vega-embed.min.js",
  "leaflet.vendorjs":
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
  "leaflet.css.vendorjs":
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css",
};

for (const [name, url] of Object.entries(files)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(new URL(name, outDir), buf);
  console.log(`${name}\t${buf.length}\t${url}`);
}

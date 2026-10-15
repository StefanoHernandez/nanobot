import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { File } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { Dialog } from "../../ui/components";

export const CDN_VERSIONS = {
  mermaid: "11.17.2",
  pdfjs: "3.11.174",
  jszip: "3.10.1",
  pako: "2.1.0",
  docxPreview: "0.3.3",
  pptxPreview: "1.0.7",
  // Note: xlsx 0.18.5 is pinned. Any parsing risk from legacy SheetJS is strictly contained by the WebView sandbox (no network, connect-src 'none', no storage, no secrets).
  xlsx: "0.18.5",
} as const;

export const ZIP_CAPS = {
  maxCdSize: 4 * 1024 * 1024, // 4 MB
  maxCdEntries: 20000,
  maxEntryCompSize: 16 * 1024 * 1024, // 16 MB
  maxEntryUncompSize: 64 * 1024 * 1024, // 64 MB
  maxTotalRequestedBytes: 64 * 1024 * 1024, // 64 MB
} as const;

export function parseZipCentralDirectory(tailChunk: Uint8Array, totalSize: number) {
  let eocdOffset = -1;
  for (let i = tailChunk.length - 22; i >= 0; i--) {
    if (tailChunk[i] === 0x50 && tailChunk[i + 1] === 0x4b && tailChunk[i + 2] === 0x05 && tailChunk[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("EOCD not found");
  const view = new DataView(tailChunk.buffer, tailChunk.byteOffset, tailChunk.byteLength);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  if (cdSize <= 0 || cdSize > ZIP_CAPS.maxCdSize) {
    throw new Error(`Central directory size ${cdSize} exceeds 4 MB cap`);
  }
  const cdEntriesCount = view.getUint16(eocdOffset + 10, true);
  if (cdEntriesCount > ZIP_CAPS.maxCdEntries) {
    throw new Error(`Central directory entries count ${cdEntriesCount} exceeds 20000 cap`);
  }
  const cdStartOffset = view.getUint32(eocdOffset + 16, true);
  if (cdStartOffset < 0 || cdStartOffset + cdSize > totalSize) {
    throw new Error("Central directory out of file bounds");
  }
  return { cdSize, cdStartOffset, cdEntriesCount };
}

export const CDN_URLS = {
  mermaid: `https://cdn.jsdelivr.net/npm/mermaid@${CDN_VERSIONS.mermaid}/dist/mermaid.min.js`,
  pdfjs: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${CDN_VERSIONS.pdfjs}/build/pdf.min.js`,
  pdfjsWorker: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${CDN_VERSIONS.pdfjs}/build/pdf.worker.min.js`,
  jszip: `https://cdn.jsdelivr.net/npm/jszip@${CDN_VERSIONS.jszip}/dist/jszip.min.js`,
  pako: `https://cdn.jsdelivr.net/npm/pako@${CDN_VERSIONS.pako}/dist/pako.min.js`,
  docxPreview: `https://cdn.jsdelivr.net/npm/docx-preview@${CDN_VERSIONS.docxPreview}/dist/docx-preview.min.js`,
  pptxPreview: `https://cdn.jsdelivr.net/npm/pptx-preview@${CDN_VERSIONS.pptxPreview}/dist/pptx-preview.umd.min.js`,
  xlsx: `https://cdn.jsdelivr.net/npm/xlsx@${CDN_VERSIONS.xlsx}/dist/xlsx.full.min.js`,
} as const;

export const CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; style-src \'unsafe-inline\' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src data: blob: https:; media-src data: blob:; worker-src blob:; connect-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri \'none\'">';

export type ArtifactKind =
  | "html"
  | "svg"
  | "mermaid"
  | "pdf"
  | "docx"
  | "pptx"
  | "xlsx";

export type ShellI18n = {
  loadingProgress?: string;
  showMoreRows?: string;
  loading?: string;
};

export type BuildShellHtmlOptions = {
  kind: ArtifactKind;
  html?: string;
  isDark?: boolean;
  bg?: string;
  fg?: string;
  /** Diagram accent colour (theme chartInput): Mermaid lines and shapes. */
  accent?: string;
  border?: string;
  fileSize?: number;
  isLightPreview?: boolean;
  i18n?: ShellI18n;
};

export type ArtifactWebViewProps = {
  kind: ArtifactKind;
  uri?: string;
  html?: string;
  base64?: string;
  name?: string;
  fileSize?: number;
  onFallback: () => void;
  isLightPreview?: boolean;
};

export function escapeHtml(str: string): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getChunkProtocolScript(): string {
  return `<script>
  window.__chunks = new Map();
  window.__chunksTotalBytes = 0;
  window.__chunkCallbacks = [];
  var MAX_CHUNK_CACHE_BYTES = 32 * 1024 * 1024; // 32 MB

  function setChunkLru(key, bytes) {
    if (window.__chunks.has(key)) {
      window.__chunksTotalBytes -= window.__chunks.get(key).length;
      window.__chunks.delete(key);
    }
    window.__chunks.set(key, bytes);
    window.__chunksTotalBytes += bytes.length;
    while (window.__chunksTotalBytes > MAX_CHUNK_CACHE_BYTES && window.__chunks.size > 0) {
      var firstKey = window.__chunks.keys().next().value;
      var firstBytes = window.__chunks.get(firstKey);
      window.__chunksTotalBytes -= firstBytes.length;
      window.__chunks.delete(firstKey);
    }
  }

  function getChunkLru(key) {
    if (!window.__chunks.has(key)) return null;
    var val = window.__chunks.get(key);
    window.__chunks.delete(key);
    window.__chunks.set(key, val);
    return val;
  }

  window.__chunk = function(offset, b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    var key = offset + ":" + bytes.length;
    setChunkLru(key, bytes);
    for (var j = window.__chunkCallbacks.length - 1; j >= 0; j--) {
      var cb = window.__chunkCallbacks[j];
      if (cb.key === key || (cb.offset === offset && cb.length === bytes.length)) {
        window.__chunkCallbacks.splice(j, 1);
        cb.resolve(bytes);
      }
    }
  };

  window.__chunkError = function(offset) {
    for (var j = window.__chunkCallbacks.length - 1; j >= 0; j--) {
      var cb = window.__chunkCallbacks[j];
      if (cb.offset === offset) {
        window.__chunkCallbacks.splice(j, 1);
        if (cb.reject) cb.reject(new Error("Chunk error at " + offset));
      }
    }
    postError(new Error("Chunk error at offset " + offset));
  };

  function postReady() {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "ready" }));
    }
  }
  function postError(err) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error" }));
    }
  }

  function requestChunk(offset, length) {
    var key = offset + ":" + length;
    return new Promise(function(resolve, reject) {
      var cached = getChunkLru(key);
      if (cached) {
        resolve(cached);
        return;
      }
      window.__chunkCallbacks.push({ key: key, offset: offset, length: length, resolve: resolve, reject: reject });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "need",
          offset: offset,
          length: length
        }));
      }
    });
  }

  async function requestChunkRange(begin, end) {
    var totalToRead = end - begin;
    var pos = begin;
    var chunks = [];
    while (pos < end) {
      var len = Math.min(1048576, end - pos);
      var c = await requestChunk(pos, len);
      chunks.push(c);
      pos += len;
    }
    if (chunks.length === 1 && chunks[0].length === totalToRead) return chunks[0];
    var combined = new Uint8Array(totalToRead);
    var cur = 0;
    for (var i = 0; i < chunks.length; i++) {
      combined.set(chunks[i], cur);
      cur += chunks[i].length;
    }
    return combined;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
</script>`;
}

function buildLightPreviewShell({
  kind,
  fileSize,
  bg,
  fg,
  isDark,
}: {
  kind: "docx" | "pptx" | "xlsx";
  fileSize: number;
  bg: string;
  fg: string;
  isDark: boolean;
}): string {
  const lightHead = `<head>
${CSP_META}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background-color: ${bg};
    color: ${fg};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  #container {
    padding: 16px;
    box-sizing: border-box;
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    margin-top: 16px;
  }
  .gallery img {
    width: 100%;
    height: auto;
    border-radius: 4px;
    object-fit: cover;
  }
  .thumbnail {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    margin-bottom: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  table.sheet-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
  }
  table.sheet-table th, table.sheet-table td {
    border: 1px solid ${isDark ? "#333" : "#ddd"};
    padding: 6px 10px;
    text-align: left;
  }
  table.sheet-table th {
    background-color: ${isDark ? "#222" : "#f2f2f2"};
  }
</style>
${getChunkProtocolScript()}
<script>
  var MAX_CD_SIZE = 4194304; // 4 MB
  var MAX_CD_ENTRIES = 20000;
  var MAX_ENTRY_COMP_SIZE = 16777216; // 16 MB
  var MAX_ENTRY_UNCOMP_SIZE = 67108864; // 64 MB
  var MAX_TOTAL_LIGHT_PREVIEW_BYTES = 67108864; // 64 MB
  var totalRequestedBytes = 0;

  function checkRange(begin, end, totalSize) {
    if (typeof begin !== "number" || typeof end !== "number" || begin < 0 || begin >= end || end > totalSize) {
      throw new Error("Invalid range: " + begin + " to " + end);
    }
    totalRequestedBytes += (end - begin);
    if (totalRequestedBytes > MAX_TOTAL_LIGHT_PREVIEW_BYTES) {
      throw new Error("Total requested bytes exceeded 64 MB cap");
    }
  }

  async function safeRequestChunkRange(begin, end, totalSize) {
    checkRange(begin, end, totalSize);
    return await requestChunkRange(begin, end);
  }

  async function safeRequestChunk(offset, length, totalSize) {
    checkRange(offset, offset + length, totalSize);
    return await requestChunk(offset, length);
  }

  async function readZipCentralDirectory(totalSize) {
    var readLen = Math.min(65536, totalSize);
    var readOffset = totalSize - readLen;
    var tailChunk = await safeRequestChunk(readOffset, readLen, totalSize);
    var eocdOffset = -1;
    for (var i = tailChunk.length - 22; i >= 0; i--) {
      if (tailChunk[i] === 0x50 && tailChunk[i+1] === 0x4b && tailChunk[i+2] === 0x05 && tailChunk[i+3] === 0x06) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error("EOCD not found");
    var view = new DataView(tailChunk.buffer, tailChunk.byteOffset, tailChunk.byteLength);
    var cdSize = view.getUint32(eocdOffset + 12, true);
    if (cdSize <= 0 || cdSize > MAX_CD_SIZE) {
      throw new Error("Central directory size " + cdSize + " exceeds 4 MB cap");
    }
    var cdEntriesCount = view.getUint16(eocdOffset + 10, true);
    if (cdEntriesCount > MAX_CD_ENTRIES) {
      throw new Error("Central directory entries count " + cdEntriesCount + " exceeds 20000 cap");
    }
    var cdStartOffset = view.getUint32(eocdOffset + 16, true);
    if (cdStartOffset < 0 || cdStartOffset + cdSize > totalSize) {
      throw new Error("Central directory out of bounds");
    }
    var cdBytes = await safeRequestChunkRange(cdStartOffset, cdStartOffset + cdSize, totalSize);
    var cdView = new DataView(cdBytes.buffer, cdBytes.byteOffset, cdBytes.byteLength);
    var entries = [];
    var p = 0;
    while (p < cdBytes.length - 4) {
      var sig = cdView.getUint32(p, true);
      if (sig !== 0x02014b50) break;
      if (entries.length >= MAX_CD_ENTRIES) {
        throw new Error("Exceeded 20000 entries cap");
      }
      var method = cdView.getUint16(p + 10, true);
      var compSize = cdView.getUint32(p + 20, true);
      var uncompSize = cdView.getUint32(p + 24, true);
      if (compSize > MAX_ENTRY_COMP_SIZE) {
        throw new Error("Compressed entry size exceeds 16 MB cap: " + compSize);
      }
      if (uncompSize > MAX_ENTRY_UNCOMP_SIZE) {
        throw new Error("Uncompressed entry size exceeds 64 MB cap: " + uncompSize);
      }
      var fnLen = cdView.getUint16(p + 28, true);
      var extraLen = cdView.getUint16(p + 30, true);
      var commentLen = cdView.getUint16(p + 32, true);
      var localHdrOffset = cdView.getUint32(p + 42, true);
      var fnBytes = cdBytes.subarray(p + 46, p + 46 + fnLen);
      var filename = new TextDecoder("utf-8").decode(fnBytes);
      entries.push({
        filename: filename,
        method: method,
        compSize: compSize,
        uncompSize: uncompSize,
        localHdrOffset: localHdrOffset
      });
      p += 46 + fnLen + extraLen + commentLen;
    }
    return entries;
  }

  async function extractZipEntry(entry, totalSize) {
    if (entry.compSize > MAX_ENTRY_COMP_SIZE || entry.uncompSize > MAX_ENTRY_UNCOMP_SIZE) {
      throw new Error("Entry size exceeds cap");
    }
    var hdrChunk = await safeRequestChunk(entry.localHdrOffset, Math.min(1024, entry.compSize + 128), totalSize);
    var hdrView = new DataView(hdrChunk.buffer, hdrChunk.byteOffset, hdrChunk.byteLength);
    var fnLen = hdrView.getUint16(26, true);
    var extraLen = hdrView.getUint16(28, true);
    var dataStart = entry.localHdrOffset + 30 + fnLen + extraLen;
    var compData = await safeRequestChunkRange(dataStart, dataStart + entry.compSize, totalSize);
    if (entry.method === 0) {
      if (compData.length > MAX_ENTRY_UNCOMP_SIZE) throw new Error("Stored entry exceeds 64 MB cap");
      return compData;
    } else if (entry.method === 8) {
      if (entry.uncompSize > MAX_ENTRY_UNCOMP_SIZE) throw new Error("Uncompressed size exceeds 64 MB cap");
      var uncompressed = pako.inflateRaw(compData);
      if (uncompressed.length > MAX_ENTRY_UNCOMP_SIZE) throw new Error("Inflated output exceeds 64 MB cap");
      return uncompressed;
    }
    throw new Error("Unsupported zip compression: " + entry.method);
  }
</script>
</head>`;

  return `<!DOCTYPE html>
<html>
${lightHead}
<body>
  <div id="container"></div>
  <script src="${CDN_URLS.pako}"></script>
  <script>
    (async function() {
      try {
        var container = document.getElementById("container");
        var entries = await readZipCentralDirectory(${fileSize});

        ${
          kind === "pptx"
            ? `
          var thumbEntry = entries.find(function(e) { return /docProps\\/thumbnail\\.(jpe?g|png)$/i.test(e.filename); });
          var mediaEntries = entries.filter(function(e) { return /^ppt\\/media\\//i.test(e.filename); }).slice(0, 30);

          if (thumbEntry) {
            try {
              var tBytes = await extractZipEntry(thumbEntry, ${fileSize});
              var tBlob = new Blob([tBytes], { type: "image/jpeg" });
              var tImg = document.createElement("img");
              tImg.className = "thumbnail";
              tImg.src = URL.createObjectURL(tBlob);
              container.appendChild(tImg);
            } catch(e) {}
          }

          if (mediaEntries.length > 0) {
            var gallery = document.createElement("div");
            gallery.className = "gallery";
            for (var m of mediaEntries) {
              try {
                var mBytes = await extractZipEntry(m, ${fileSize});
                var isPng = m.filename.toLowerCase().endsWith(".png");
                var mBlob = new Blob([mBytes], { type: isPng ? "image/png" : "image/jpeg" });
                var mImg = document.createElement("img");
                mImg.src = URL.createObjectURL(mBlob);
                gallery.appendChild(mImg);
              } catch(e) {}
            }
            container.appendChild(gallery);
          }
          postReady();
        `
            : kind === "docx"
            ? `
          var docEntry = entries.find(function(e) { return e.filename === "word/document.xml"; });
          if (!docEntry) throw new Error("document.xml not found");
          var docBytes = await extractZipEntry(docEntry, ${fileSize});
          var xmlStr = new TextDecoder("utf-8").decode(docBytes);
          var doc = new DOMParser().parseFromString(xmlStr, "application/xml");
          var paragraphs = doc.getElementsByTagNameNS("*", "p");
          var count = Math.min(200, paragraphs.length);
          var html = "";
          for (var i = 0; i < count; i++) {
            var textNodes = paragraphs[i].getElementsByTagNameNS("*", "t");
            var pText = "";
            for (var j = 0; j < textNodes.length; j++) pText += textNodes[j].textContent || "";
            if (pText.trim()) {
              html += "<p style='margin-bottom:8px;line-height:1.5;'>" + escapeHtml(pText) + "</p>";
            }
          }
          container.innerHTML = html;
          postReady();
        `
            : `
          var ssEntry = entries.find(function(e) { return e.filename === "xl/sharedStrings.xml"; });
          var sheetEntry = entries.find(function(e) { return e.filename === "xl/worksheets/sheet1.xml"; });
          if (!sheetEntry) throw new Error("sheet1.xml not found");
          var strings = [];
          if (ssEntry) {
            var ssBytes = await extractZipEntry(ssEntry, ${fileSize});
            var ssXml = new TextDecoder("utf-8").decode(ssBytes);
            var ssDoc = new DOMParser().parseFromString(ssXml, "application/xml");
            var siNodes = ssDoc.getElementsByTagNameNS("*", "si");
            for (var i = 0; i < siNodes.length; i++) strings.push(siNodes[i].textContent || "");
          }
          var sBytes = await extractZipEntry(sheetEntry, ${fileSize});
          var sXml = new TextDecoder("utf-8").decode(sBytes);
          var sDoc = new DOMParser().parseFromString(sXml, "application/xml");
          var rowNodes = sDoc.getElementsByTagNameNS("*", "row");
          var rowCount = Math.min(200, rowNodes.length);
          var tblHtml = "<table class='sheet-table'><tbody>";
          for (var r = 0; r < rowCount; r++) {
            tblHtml += "<tr>";
            var cNodes = rowNodes[r].getElementsByTagNameNS("*", "c");
            for (var c = 0; c < cNodes.length; c++) {
              var cell = cNodes[c];
              var type = cell.getAttribute("t");
              var valNode = cell.getElementsByTagNameNS("*", "v")[0];
              var rawVal = valNode ? valNode.textContent : "";
              var displayVal = rawVal;
              if (type === "s" && strings[parseInt(rawVal, 10)]) {
                displayVal = strings[parseInt(rawVal, 10)];
              }
              var tag = r === 0 ? "th" : "td";
              tblHtml += "<" + tag + ">" + escapeHtml(displayVal) + "</" + tag + ">";
            }
            tblHtml += "</tr>";
          }
          tblHtml += "</tbody></table>";
          container.innerHTML = tblHtml;
          postReady();
        `
        }
      } catch(err) {
        postError(err);
      }
    })();
  </script>
</body>
</html>`;
}

export function buildShellHtml({
  kind,
  html = "",
  isDark = false,
  bg = "#ffffff",
  fg = "#000000",
  accent = "#2f3389",
  border = "#d3d7f3",
  fileSize = 0,
  isLightPreview = false,
  i18n = {},
}: BuildShellHtmlOptions): string {
  const loadingLabel = i18n.loading || "Caricamento...";
  const progressTpl = i18n.loadingProgress || "Caricamento {{loaded}}/{{total}} MB";
  const showMoreRowsLabel = i18n.showMoreRows || "Mostra altre righe";

  const mermaidTheme = `{
    startOnLoad: false,
    theme: "${isDark ? "dark" : "default"}",
    themeVariables: {
      background: "${bg}",
      primaryColor: "${accent}",
      primaryTextColor: "${fg}",
      lineColor: "${fg}",
      textColor: "${fg}",
      clusterBkg: "${bg}",
      edgeLabelBackground: "${bg}",
      mainBkg: "${accent}",
      nodeBorder: "${border}"
    }
  }`;

  // Pinch zoom, drag to pan, double-tap toggles fit / 2x. CSS transforms only; reduced motion skips the easing.
  const zoomScript = `<script>
    (function() {
      var target = document.getElementById("container");
      if (!target) return;
      var scale = 1, x = 0, y = 0, startDist = 0, startScale = 1, lastTap = 0;
      var drag = null;
      var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      function dist(a, b) { var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY; return Math.hypot(dx, dy); }
      function apply(animate) {
        target.style.transition = animate && !still ? "transform 160ms ease-out" : "none";
        target.style.transformOrigin = "0 0";
        target.style.transform = "translate(" + x + "px," + y + "px) scale(" + scale + ")";
      }
      target.addEventListener("touchstart", function(e) {
        if (e.touches.length === 2) { startDist = dist(e.touches[0], e.touches[1]); startScale = scale; }
        else if (e.touches.length === 1) { drag = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, ox: x, oy: y }; }
      }, { passive: true });
      target.addEventListener("touchmove", function(e) {
        if (e.touches.length === 2 && startDist) {
          scale = Math.min(6, Math.max(0.5, startScale * dist(e.touches[0], e.touches[1]) / startDist));
          apply(false); e.preventDefault();
        } else if (e.touches.length === 1 && drag && scale > 1) {
          x = drag.ox + (e.touches[0].clientX - drag.sx);
          y = drag.oy + (e.touches[0].clientY - drag.sy);
          apply(false); e.preventDefault();
        }
      }, { passive: false });
      target.addEventListener("touchend", function(e) {
        if (e.touches.length < 2) startDist = 0;
        if (e.touches.length === 0) drag = null;
        if (e.changedTouches.length === 1 && scale === 1) {
          var now = Date.now();
          if (now - lastTap < 300) { scale = 2; apply(true); }
          lastTap = now;
        }
      });
    })();
  </script>`;

  // Common bootstrap script that manages chunks & ready/error reporting
  const commonHead = `<head>
${CSP_META}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background-color: ${bg};
    color: ${fg};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  #container {
    width: 100%;
    min-height: 100vh;
    box-sizing: border-box;
  }
  .progress-wrap {
    padding: 24px;
    text-align: center;
    font-size: 15px;
  }
  table.sheet-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
  }
  table.sheet-table th, table.sheet-table td {
    border: 1px solid ${isDark ? "#333" : "#ddd"};
    padding: 6px 10px;
    text-align: left;
  }
  table.sheet-table th {
    background-color: ${isDark ? "#222" : "#f2f2f2"};
  }
  .tab-bar {
    display: flex;
    overflow-x: auto;
    border-bottom: 1px solid ${isDark ? "#333" : "#ddd"};
    background-color: ${isDark ? "#1a1a1a" : "#fafafa"};
    padding: 4px;
  }
  .tab-btn {
    padding: 8px 16px;
    cursor: pointer;
    border: none;
    background: transparent;
    color: ${fg};
    font-size: 14px;
    border-radius: 4px;
    margin-right: 4px;
  }
  .tab-btn.active {
    background: ${isDark ? "#333" : "#e0e0e0"};
    font-weight: bold;
  }
  .more-btn {
    margin: 16px;
    padding: 8px 16px;
    border: 1px solid ${isDark ? "#444" : "#ccc"};
    border-radius: 4px;
    background: ${isDark ? "#2a2a2a" : "#f8f8f8"};
    color: ${fg};
  }
  </style>
${getChunkProtocolScript()}
</head>`;

  const loadAllChunksScript = `<script>
  async function loadAllChunks(totalSize, onProgress) {
    var CHUNK_SIZE = 1048576;
    var offset = 0;
    var chunks = [];
    var loaded = 0;
    while (offset < totalSize) {
      var len = Math.min(CHUNK_SIZE, totalSize - offset);
      var chunk = await requestChunk(offset, len);
      chunks.push(chunk);
      loaded += chunk.length;
      if (onProgress) {
        onProgress(loaded, totalSize);
      }
      offset += len;
    }
    var full = new Uint8Array(totalSize);
    var pos = 0;
    for (var i = 0; i < chunks.length; i++) {
      full.set(chunks[i], pos);
      pos += chunks[i].length;
    }
    return full;
  }
</script>`;

  if (kind === "html") {
    if (!html && fileSize > 0) {
      return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="container"></div>
  ${loadAllChunksScript}
  <script>
    loadAllChunks(${fileSize}, null).then(function(bytes) {
      var text = new TextDecoder("utf-8").decode(bytes);
      document.getElementById("container").innerHTML = text;
      postReady();
    }).catch(function(e) {
      postError(e);
    });
  </script>
</body>
</html>`;
    }
    return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="container">
    ${html}
  </div>
  <script>
    window.addEventListener("DOMContentLoaded", function() { postReady(); });
    window.addEventListener("error", function() { postError(); });
    setTimeout(function() { postReady(); }, 300);
  </script>
</body>
</html>`;
  }

  if (kind === "svg") {
    if (!html && fileSize > 0) {
      return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="container" style="display:flex;justify-content:center;align-items:center;padding:16px;"></div>
  ${loadAllChunksScript}
  <script>
    loadAllChunks(${fileSize}, null).then(function(bytes) {
      var text = new TextDecoder("utf-8").decode(bytes);
      document.getElementById("container").innerHTML = text;
      postReady();
    }).catch(function(e) {
      postError(e);
    });
  </script>
</body>
</html>`;
    }
    return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="container" style="display:flex;justify-content:center;align-items:center;padding:16px;">
    ${html}
  </div>
  <script>
    postReady();
  </script>
  ${zoomScript}
</body>
</html>`;
  }

  if (kind === "mermaid") {
    if (!html && fileSize > 0) {
      return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="container" style="padding:16px;"></div>
  <script src="${CDN_URLS.mermaid}"></script>
  ${loadAllChunksScript}
  <script>
    loadAllChunks(${fileSize}, null).then(function(bytes) {
      var text = new TextDecoder("utf-8").decode(bytes);
      var container = document.getElementById("container");
      container.innerHTML = '<pre class="mermaid" style="display:flex;justify-content:center;">' + escapeHtml(text) + '</pre>';
      mermaid.initialize(${mermaidTheme});
      return mermaid.run();
    }).then(function() {
      postReady();
    }).catch(function(e) {
      postError(e);
    });
  </script>
</body>
</html>`;
    }
    return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="container" style="padding:16px;">
    <pre class="mermaid" style="display:flex;justify-content:center;">${escapeHtml(html)}</pre>
  </div>
  <script src="${CDN_URLS.mermaid}"></script>
  <script>
    try {
      mermaid.initialize(${mermaidTheme});
      mermaid.run().then(function() {
        postReady();
      }).catch(function() {
        postError();
      });
    } catch(e) {
      postError(e);
    }
  </script>
  ${zoomScript}
</body>
</html>`;
  }

  if (kind === "pdf") {
    return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="container" style="display:flex;flex-direction:column;align-items:center;padding:16px;"></div>
  <script src="${CDN_URLS.pdfjs}"></script>
  <script>
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "${CDN_URLS.pdfjsWorker}";
      var totalSize = ${fileSize};

      class RangeTransport extends pdfjsLib.PDFDataRangeTransport {
        constructor(length, initialData) {
          super(length, initialData);
        }
        requestDataRange(begin, end) {
          var self = this;
          requestChunkRange(begin, end).then(function(chunk) {
            self.onDataRange(begin, chunk);
          }).catch(function(err) {
            postError(err);
          });
        }
      }

      var initChunkSize = Math.min(1048576, totalSize);
      requestChunk(0, initChunkSize).then(function(initialChunk) {
        var transport = new RangeTransport(totalSize, initialChunk);
        return pdfjsLib.getDocument({
          range: transport,
          disableAutoFetch: true,
          disableStream: true
        }).promise;
      }).then(async function(pdf) {
        var container = document.getElementById("container");
        var numPages = pdf.numPages;
        var placeholders = [];
        var rendered = new Map();
        var pageAspects = new Map();
        var baseScale = 1.5;
        var currentScale = baseScale;

        var firstPage = await pdf.getPage(1);
        var firstViewport = firstPage.getViewport({ scale: currentScale });
        var defaultAspect = firstViewport.height / firstViewport.width;
        pageAspects.set(1, defaultAspect);

        for (var p = 1; p <= numPages; p++) {
          var w = document.createElement("div");
          w.id = "page-wrapper-" + p;
          w.dataset.page = p;
          w.style.width = "100%";
          w.style.maxWidth = "800px";
          w.style.minHeight = "200px";
          w.style.marginBottom = "16px";
          w.style.aspectRatio = (1 / defaultAspect) + "";
          w.style.backgroundColor = "${isDark ? "#222" : "#ffffff"}";
          w.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
          w.style.display = "flex";
          w.style.justifyContent = "center";
          w.style.alignItems = "center";
          container.appendChild(w);
          placeholders.push(w);
        }

        async function updatePlaceholderSize(pageNum, wrapper) {
          if (pageAspects.has(pageNum)) {
            var asp = pageAspects.get(pageNum);
            wrapper.style.aspectRatio = (1 / asp) + "";
            return;
          }
          try {
            var p = await pdf.getPage(pageNum);
            var vp = p.getViewport({ scale: currentScale });
            var asp = vp.height / vp.width;
            pageAspects.set(pageNum, asp);
            wrapper.style.aspectRatio = (1 / asp) + "";
          } catch(e) {}
        }

        async function renderPage(pageNum, wrapper) {
          if (rendered.has(pageNum)) return;
          var page = await pdf.getPage(pageNum);
          var viewport = page.getViewport({ scale: currentScale });
          var actualAspect = viewport.height / viewport.width;
          pageAspects.set(pageNum, actualAspect);
          var canvas = document.createElement("canvas");
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          var ctx = canvas.getContext("2d");
          wrapper.innerHTML = "";
          wrapper.style.aspectRatio = (1 / actualAspect) + "";
          wrapper.appendChild(canvas);
          var task = page.render({ canvasContext: ctx, viewport: viewport });
          rendered.set(pageNum, { canvas: canvas, task: task });
        }

        function freePage(pageNum, wrapper) {
          if (!rendered.has(pageNum)) return;
          var entry = rendered.get(pageNum);
          try { if (entry.task && entry.task.cancel) entry.task.cancel(); } catch(e){}
          wrapper.innerHTML = "";
          var asp = pageAspects.get(pageNum) || defaultAspect;
          wrapper.style.aspectRatio = (1 / asp) + "";
          rendered.delete(pageNum);
        }

        function pruneFar(activePage) {
          rendered.forEach(function(val, pn) {
            if (Math.abs(pn - activePage) > 3) {
              var wrap = document.getElementById("page-wrapper-" + pn);
              if (wrap) freePage(pn, wrap);
            }
          });
        }

        var observer = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            var pn = parseInt(entry.target.dataset.page, 10);
            if (entry.isIntersecting) {
              renderPage(pn, entry.target);
              pruneFar(pn);
            } else {
              updatePlaceholderSize(pn, entry.target);
            }
          });
        }, { rootMargin: "300px 0px 300px 0px" });

        placeholders.forEach(function(el) { observer.observe(el); });

        // Render first page immediately and notify ready
        await renderPage(1, placeholders[0]);
        postReady();

        // Support pinch zoom / resize debounce
        var zoomDebounce = null;
        var initialPinchDist = null;
        var initialScale = baseScale;

        function applyZoom(newScale) {
          newScale = Math.max(0.5, Math.min(4.0, newScale));
          if (Math.abs(newScale - currentScale) < 0.05) return;
          clearTimeout(zoomDebounce);
          zoomDebounce = setTimeout(function() {
            var scrollY = window.scrollY || document.documentElement.scrollTop;
            var oldScale = currentScale;
            currentScale = newScale;
            rendered.forEach(function(val, pn) {
              var wrap = document.getElementById("page-wrapper-" + pn);
              if (wrap) {
                freePage(pn, wrap);
                renderPage(pn, wrap);
              }
            });
            if (oldScale > 0) {
              window.scrollTo(0, scrollY * (currentScale / oldScale));
            }
          }, 250);
        }

        if (window.visualViewport) {
          window.visualViewport.addEventListener("resize", function() {
            if (window.visualViewport.scale && window.visualViewport.scale !== 1) {
              applyZoom(baseScale * window.visualViewport.scale);
            }
          });
        }

        window.addEventListener("touchstart", function(e) {
          if (e.touches.length === 2) {
            var dx = e.touches[0].clientX - e.touches[1].clientX;
            var dy = e.touches[0].clientY - e.touches[1].clientY;
            initialPinchDist = Math.sqrt(dx * dx + dy * dy);
            initialScale = currentScale;
          }
        }, { passive: true });

        window.addEventListener("touchmove", function(e) {
          if (e.touches.length === 2 && initialPinchDist) {
            var dx = e.touches[0].clientX - e.touches[1].clientX;
            var dy = e.touches[0].clientY - e.touches[1].clientY;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var factor = dist / initialPinchDist;
            applyZoom(initialScale * factor);
          }
        }, { passive: true });

        window.addEventListener("touchend", function(e) {
          if (e.touches.length < 2) {
            initialPinchDist = null;
          }
        }, { passive: true });

        window.addEventListener("resize", function() {
          applyZoom(currentScale);
        });
      }).catch(function(e) {
        postError(e);
      });
    } catch(err) {
      postError(err);
    }
  </script>
</body>
</html>`;
  }

  if (kind === "docx") {
    if (isLightPreview) {
      return buildLightPreviewShell({ kind: "docx", fileSize, bg, fg, isDark });
    }
    return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="progress" class="progress-wrap">${escapeHtml(loadingLabel)}</div>
  <div id="container" style="padding:16px;"></div>
  <script src="${CDN_URLS.jszip}"></script>
  <script src="${CDN_URLS.docxPreview}"></script>
  ${loadAllChunksScript}
  <script>
    var prog = document.getElementById("progress");
    loadAllChunks(${fileSize}, function(loaded, total) {
      var lMB = (loaded / 1048576).toFixed(1);
      var tMB = (total / 1048576).toFixed(1);
      prog.innerText = ${JSON.stringify(progressTpl)}.replace("{{loaded}}", lMB).replace("{{total}}", tMB);
    }).then(function(bytes) {
      prog.style.display = "none";
      var container = document.getElementById("container");
      return docx.renderAsync(bytes, container, null, { inWrapper: false });
    }).then(function() {
      postReady();
    }).catch(function(e) {
      postError(e);
    });
  </script>
</body>
</html>`;
  }

  if (kind === "pptx") {
    if (isLightPreview) {
      return buildLightPreviewShell({ kind: "pptx", fileSize, bg, fg, isDark });
    }
    return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="progress" class="progress-wrap">${escapeHtml(loadingLabel)}</div>
  <div id="container" style="display:flex;flex-direction:column;align-items:center;padding:16px;"></div>
  <script src="${CDN_URLS.pptxPreview}"></script>
  ${loadAllChunksScript}
  <script>
    var prog = document.getElementById("progress");
    loadAllChunks(${fileSize}, function(loaded, total) {
      var lMB = (loaded / 1048576).toFixed(1);
      var tMB = (total / 1048576).toFixed(1);
      prog.innerText = ${JSON.stringify(progressTpl)}.replace("{{loaded}}", lMB).replace("{{total}}", tMB);
    }).then(function(bytes) {
      prog.style.display = "none";
      var container = document.getElementById("container");
      if (!window.pptxPreview || typeof window.pptxPreview.init !== "function") {
        throw new Error("pptxPreview not available");
      }
      var previewer = window.pptxPreview.init(container, {});
      return previewer.preview(bytes.buffer);
    }).then(function() {
      postReady();
    }).catch(function(e) {
      postError(e);
    });
  </script>
</body>
</html>`;
  }

  if (kind === "xlsx") {
    if (isLightPreview) {
      return buildLightPreviewShell({ kind: "xlsx", fileSize, bg, fg, isDark });
    }
    return `<!DOCTYPE html>
<html>
${commonHead}
<body>
  <div id="progress" class="progress-wrap">${escapeHtml(loadingLabel)}</div>
  <div id="tab-bar" class="tab-bar"></div>
  <div id="sheet-content" style="overflow-x:auto;padding:8px;"></div>
  <script src="${CDN_URLS.xlsx}"></script>
  ${loadAllChunksScript}
  <script>
    var prog = document.getElementById("progress");
    loadAllChunks(${fileSize}, function(loaded, total) {
      var lMB = (loaded / 1048576).toFixed(1);
      var tMB = (total / 1048576).toFixed(1);
      prog.innerText = ${JSON.stringify(progressTpl)}.replace("{{loaded}}", lMB).replace("{{total}}", tMB);
    }).then(function(bytes) {
      prog.style.display = "none";
      var wb = XLSX.read(bytes, { type: "array" });
      var tabBar = document.getElementById("tab-bar");
      var sheetContent = document.getElementById("sheet-content");
      var activeIndex = 0;
      var rowLimits = {};

      function renderSheet(idx) {
        var sheetName = wb.SheetNames[idx];
        var sheet = wb.Sheets[sheetName];
        var rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        var limit = rowLimits[sheetName] || 500;
        var shownRows = rows.slice(0, limit);

        var html = '<table class="sheet-table"><tbody>';
        for (var r = 0; r < shownRows.length; r++) {
          html += "<tr>";
          for (var c = 0; c < (shownRows[r] ? shownRows[r].length : 0); c++) {
            var val = shownRows[r][c];
            var tag = r === 0 ? "th" : "td";
            html += "<" + tag + ">" + escapeHtml(val != null ? val : "") + "</" + tag + ">";
          }
          html += "</tr>";
        }
        html += "</tbody></table>";

        if (rows.length > limit) {
          html += '<button id="more-rows-btn" class="more-btn">' + ${JSON.stringify(showMoreRowsLabel)} + '</button>';
        }

        sheetContent.innerHTML = html;

        var moreBtn = document.getElementById("more-rows-btn");
        if (moreBtn) {
          moreBtn.addEventListener("click", function() {
            rowLimits[sheetName] = limit + 500;
            renderSheet(idx);
          });
        }
      }

      wb.SheetNames.forEach(function(name, i) {
        var btn = document.createElement("button");
        btn.className = "tab-btn" + (i === 0 ? " active" : "");
        btn.innerText = name;
        btn.onclick = function() {
          document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
          btn.classList.add("active");
          renderSheet(i);
        };
        tabBar.appendChild(btn);
      });

      if (wb.SheetNames.length > 0) {
        renderSheet(0);
      }
      postReady();
    }).catch(function(e) {
      postError(e);
    });
  </script>
</body>
</html>`;
  }

  return "";
}

export function ArtifactWebView({
  kind,
  uri,
  html,
  fileSize,
  onFallback,
  isLightPreview = false,
}: ArtifactWebViewProps) {
  const t = useT();
  const th = useTheme();
  const webViewRef = useRef<WebView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoadRef = useRef(true);
  const onFallbackRef = useRef(onFallback);
  onFallbackRef.current = onFallback;
  const isReadyRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [lightMode, setLightMode] = useState(isLightPreview);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Compute file size if not provided
  const resolvedSize = useMemo(() => {
    if (fileSize != null) return fileSize;
    if (uri) {
      try {
        const file = new File(uri);
        return file.size ?? 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }, [fileSize, uri]);

  const shellI18n: ShellI18n = useMemo(
    () => ({
      loadingProgress: t("artifact.loadingProgress"),
      showMoreRows: t("artifact.showMoreRows"),
      loading: t("thread.loading") || "Loading...",
    }),
    [t]
  );

  const activeLightPreview = lightMode || isLightPreview;

  const shellHtml = useMemo(() => {
    return buildShellHtml({
      kind,
      html,
      isDark: th.scheme === "dark",
      bg: th.colors.popover,
      fg: th.colors.popoverForeground,
      accent: th.colors.chartInput,
      border: th.colors.border,
      fileSize: resolvedSize,
      isLightPreview: activeLightPreview,
      i18n: shellI18n,
    });
  }, [kind, html, th.scheme, th.colors.popover, th.colors.popoverForeground, th.colors.chartInput, th.colors.border, resolvedSize, activeLightPreview, shellI18n]);

  // Track shell version and reset isFirstLoadRef whenever shellHtml changes
  const prevShellHtmlRef = useRef<string | null>(null);
  const shellVersionRef = useRef(0);
  if (prevShellHtmlRef.current !== shellHtml) {
    prevShellHtmlRef.current = shellHtml;
    isFirstLoadRef.current = true;
    shellVersionRef.current += 1;
  }

  const resetInactivityTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isReadyRef.current) return;
    timeoutRef.current = setTimeout(() => {
      onFallbackRef.current();
    }, 20000);
  };

  // Inactivity timeout runs on mount and when shellHtml changes. Never restarts after ready.
  useEffect(() => {
    isReadyRef.current = false;
    resetInactivityTimeout();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [shellHtml]);

  const handleShouldStartLoad = (request: { url: string }) => {
    const url = request.url;
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      if (url === "about:blank" || url.startsWith("data:")) {
        return true;
      }
    }

    if (/^https?:/i.test(url)) {
      setPendingUrl(url);
      setShowConfirmDialog(true);
    }
    return false;
  };

  const handleMessage = async (event: WebViewMessageEvent) => {
    let data: any;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (!data || typeof data !== "object") return;

    if (data.type === "ready") {
      isReadyRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setLoading(false);
      return;
    }

    if (data.type === "error") {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      onFallbackRef.current();
      return;
    }

    if (data.type === "need") {
      const { offset, length } = data;
      if (
        typeof offset !== "number" ||
        typeof length !== "number" ||
        !Number.isInteger(offset) ||
        !Number.isInteger(length) ||
        offset < 0 ||
        length <= 0
      ) {
        return;
      }
      if (offset >= resolvedSize) {
        webViewRef.current?.injectJavaScript(`window.__chunkError(${offset}); true;`);
        return;
      }
      const readLength = Math.min(length, 1048576, resolvedSize - offset);
      resetInactivityTimeout();
      try {
        if (uri) {
          const b64 = await FileSystemLegacy.readAsStringAsync(uri, {
            encoding: FileSystemLegacy.EncodingType.Base64,
            position: offset,
            length: readLength,
          });
          webViewRef.current?.injectJavaScript(`window.__chunk(${offset}, '${b64}'); true;`);
        }
      } catch {
        webViewRef.current?.injectJavaScript(`window.__chunkError(${offset}); true;`);
      }
      return;
    }

    // Any other type is ignored
  };

  const handleRenderProcessGone = () => {
    setLightMode(true);
  };

  const handleConfirmOpenBrowser = () => {
    setShowConfirmDialog(false);
    if (pendingUrl) {
      Linking.openURL(pendingUrl).catch(() => {});
      setPendingUrl(null);
    }
  };

  return (
    <View testID={activeLightPreview ? "light-preview" : undefined} style={styles.container}>
      <WebView
        key={`webview-${shellVersionRef.current}`}
        ref={webViewRef}
        source={{ html: shellHtml, baseUrl: "about:blank" }}
        javaScriptEnabled={true}
        domStorageEnabled={false}
        incognito={true}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        geolocationEnabled={false}
        mediaCapturePermissionGrantType="deny"
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onMessage={handleMessage}
        onRenderProcessGone={handleRenderProcessGone}
        style={{ flex: 1, backgroundColor: "transparent" }}
      />

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={th.colors.primary} />
        </View>
      )}

      <Dialog
        open={showConfirmDialog}
        title={t("artifact.openInBrowserTitle")}
        message={pendingUrl ?? ""}
        confirmLabel={t("artifact.open")}
        cancelLabel={t("artifact.cancel")}
        onConfirm={handleConfirmOpenBrowser}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});

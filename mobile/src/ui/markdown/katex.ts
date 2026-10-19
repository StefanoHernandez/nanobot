import { Platform } from "react-native";
import katex from "katex";
import { KATEX_CSS } from "./katexCss.generated";

/** Full HTML doc for one display formula, or null when KaTeX rejects the TeX (caller shows raw TeX). */
export function katexHtml(tex: string, fg: string): string | null {
  let body: string;
  try {
    body = katex.renderToString(tex, { displayMode: true, throwOnError: true, output: "html" });
  } catch {
    return null;
  }
  const cssInclusion =
    Platform.OS === "web"
      ? `<style>${KATEX_CSS}</style>`
      : `<link rel="stylesheet" href="katex.css">`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${cssInclusion}<style>
html,body{margin:0;background:transparent;color:${fg};overflow-y:hidden}
.katex-display{margin:0;padding:8px 0;overflow-x:auto;overflow-y:hidden}
.katex{font-size:1.2em}</style></head><body>${body}</body></html>`;
}

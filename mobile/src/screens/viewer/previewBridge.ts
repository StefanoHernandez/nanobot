export type PreviewHandle = { injectJavaScript: (script: string) => void };

export type HostCommand =
  | { type: "setHtmlFit"; fit: boolean }
  | { type: "exportPng" }
  | { type: "chunk"; offset: number; b64: string }
  | { type: "chunkError"; offset: number };

/** Scripts only. Same-origin would let the preview read the page secret. */
export function previewSandbox(): string {
  return "allow-scripts";
}

export function previewMessageAllowed(origin: string, fromThisFrame: boolean): boolean {
  return fromThisFrame && origin === "null";
}

/** Turns the native inject strings into commands. Unknown scripts are dropped. */
export function hostCommandFromInject(script: string): HostCommand | null {
  const fit = script.match(/^window\.__setHtmlFit&&window\.__setHtmlFit\((true|false)\);true;$/);
  if (fit) return { type: "setHtmlFit", fit: fit[1] === "true" };
  if (script === "window.__exportPng&&window.__exportPng();true;") return { type: "exportPng" };
  const chunk = script.match(/^window\.__chunk\((\d+), '([A-Za-z0-9+/=]*)'\); true;$/);
  if (chunk) return { type: "chunk", offset: Number(chunk[1]), b64: chunk[2] };
  const failed = script.match(/^window\.__chunkError\((\d+)\); true;$/);
  if (failed) return { type: "chunkError", offset: Number(failed[1]) };
  return null;
}

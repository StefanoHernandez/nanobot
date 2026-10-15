import {
  absoluteMediaUrl,
  classify,
  extOf,
  mediaName,
  openWebUrl,
  safeName,
  type MediaClass,
} from "./mediaCore";

export { absoluteMediaUrl, classify, extOf, mediaName, safeName };
export type { MediaClass };

/** The file is already on the server. The browser opens that URL; it does not copy it into a cache. */
export async function downloadMedia(url: string, _name: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error("refused");
  return url;
}

export async function shareMedia(localUri: string): Promise<void> {
  openWebUrl(localUri, (url) => window.open(url, "_blank", "noopener,noreferrer"));
}

export async function openLocal(localUri: string, _ext: string): Promise<void> {
  openWebUrl(localUri, (url) => window.open(url, "_blank", "noopener,noreferrer"));
}

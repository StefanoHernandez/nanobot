export const PREVIEW_KINDS = ["html", "svg", "mermaid"] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])$/;
const FENCE_RE = /(?:^|\n)[ ]{0,3}```([^\n]*)\n([\s\S]*?)[ ]{0,3}```/g;
const ATTR_RE = /([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;

export type FenceInfo = { lang: string; id?: string; title?: string };

export type ArtifactVersion = {
  kind: PreviewKind;
  code: string;
  title?: string;
  messageId?: string;
};

export type Artifact = {
  id: string;
  /** True when the fence carried a valid id. Those group into versions. */
  explicit: boolean;
  title?: string;
  versions: ArtifactVersion[];
};

export function fenceCode(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

/** `html id=sales-dashboard title="Vendite"` → language plus optional id and title. */
export function parseFenceInfo(info: string | undefined): FenceInfo {
  const raw = (info ?? "").trim();
  if (!raw) return { lang: "" };
  const space = raw.search(/\s/);
  const lang = (space < 0 ? raw : raw.slice(0, space)).toLowerCase();
  const attrs = space < 0 ? "" : raw.slice(space + 1);
  let id: string | undefined;
  let title: string | undefined;
  for (const match of attrs.matchAll(ATTR_RE)) {
    const key = match[1].toLowerCase();
    const value = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (key === "id") {
      const norm = value.toLowerCase();
      if (ID_RE.test(norm)) id = norm;
    } else if (key === "title") {
      const cut = value.slice(0, 80);
      if (cut) title = cut;
    }
  }
  return { lang, ...(id ? { id } : {}), ...(title ? { title } : {}) };
}

export function isPreviewKind(lang: string): lang is PreviewKind {
  return (PREVIEW_KINDS as readonly string[]).includes(lang);
}

type Source = { id?: string; content?: string | null };

/** Walk chat messages in order. The same explicit id becomes the next version. */
export function collectArtifacts(messages: readonly Source[]): Artifact[] {
  const byId = new Map<string, Artifact>();
  const order: Artifact[] = [];
  let solo = 0;
  for (const message of messages) {
    const text = message.content ?? "";
    for (const fence of text.matchAll(FENCE_RE)) {
      const info = parseFenceInfo(fence[1]);
      if (!isPreviewKind(info.lang)) continue;
      const version: ArtifactVersion = {
        kind: info.lang,
        code: fenceCode(fence[2]),
        ...(info.title ? { title: info.title } : {}),
        ...(message.id ? { messageId: message.id } : {}),
      };
      if (info.id) {
        let artifact = byId.get(info.id);
        if (!artifact) {
          artifact = { id: info.id, explicit: true, title: info.title, versions: [] };
          byId.set(info.id, artifact);
          order.push(artifact);
        }
        artifact.versions.push(version);
        if (info.title) artifact.title = info.title;
      } else {
        solo += 1;
        order.push({
          id: `solo-${solo}`,
          explicit: false,
          ...(info.title ? { title: info.title } : {}),
          versions: [version],
        });
      }
    }
  }
  return order;
}

/** The version the user tapped. Falls back to the latest copy of the same code. */
export function locateVersion(
  artifacts: readonly Artifact[],
  opts: { id?: string; code: string; messageId?: string },
): { artifact: Artifact; index: number } | null {
  const code = fenceCode(opts.code);
  const candidates = opts.id
    ? artifacts.filter((artifact) => artifact.explicit && artifact.id === opts.id)
    : artifacts.filter((artifact) => !artifact.explicit);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const artifact = candidates[i];
    for (let index = artifact.versions.length - 1; index >= 0; index--) {
      const version = artifact.versions[index];
      if (fenceCode(version.code) !== code) continue;
      if (opts.messageId && version.messageId && version.messageId !== opts.messageId) continue;
      return { artifact, index };
    }
  }
  return null;
}

import { router } from "expo-router";
import type { Artifact, PreviewKind } from "../../artifacts/collect";
import { fenceCode } from "../../artifacts/collect";
import { artifactStore } from "../viewer/artifactStore";
import { writeArtifactSource } from "../viewer/exportArtifact";

export function latestArtifactVersion(artifact: Artifact) {
  return artifact.versions[artifact.versions.length - 1];
}

export function artifactRowTitle(artifact: Artifact): string {
  const latest = latestArtifactVersion(artifact);
  if (!latest) return artifact.id;
  return latest.title ?? artifact.title ?? artifact.id;
}

function uploadExtForKind(kind: PreviewKind): string {
  if (kind === "mermaid") return "mmd";
  if (kind === "chart") return "vl";
  return kind;
}

export function previewNameForKind(kind: PreviewKind): string {
  return `preview.${uploadExtForKind(kind)}`;
}

export function mimeForArtifactKind(kind: PreviewKind): string {
  if (kind === "svg") return "image/svg+xml";
  if (kind === "html") return "text/html";
  return "text/plain";
}

function sanitizeArtifactBase(raw: string): string | null {
  let s = raw
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "-");
  s = s.replace(/^[^a-zA-Z0-9]+/, "");
  if (!s || s.includes("..") || s === "." || s === "..") return null;
  return s.length > 120 ? s.slice(0, 120) : s;
}

export function artifactUploadFileName(artifact: Artifact): string | null {
  const latest = latestArtifactVersion(artifact);
  if (!latest) return null;
  const ext = uploadExtForKind(latest.kind);
  const base = artifact.explicit
    ? sanitizeArtifactBase(artifact.id)
    : sanitizeArtifactBase(artifact.title ?? "");
  if (!base) return null;
  const fileName = `${base}.${ext}`;
  if (fileName.includes("..")) return null;
  return fileName;
}

export function openGalleryArtifactPreview(artifact: Artifact, chatKey: string): void {
  const latest = latestArtifactVersion(artifact);
  if (!latest) return;
  const name = previewNameForKind(latest.kind);
  const code = fenceCode(latest.code);
  const versions =
    artifact.explicit && artifact.versions.length > 1 ? artifact.versions : undefined;
  const index = versions ? artifact.versions.length - 1 : undefined;
  artifactStore.set(code, name, {
    id: artifact.explicit ? artifact.id : undefined,
    title: artifact.title ?? latest.title,
    versions,
    index,
  });
  router.push({ pathname: "/viewer", params: { name, chat: chatKey } });
}

export function writeGalleryArtifactUpload(
  artifact: Artifact,
): { uri: string; name: string; mime: string } | null {
  const latest = latestArtifactVersion(artifact);
  if (!latest) return null;
  const name = artifactUploadFileName(artifact);
  if (!name) return null;
  const uri = writeArtifactSource(name, fenceCode(latest.code));
  if (!uri) return null;
  return { uri, name, mime: mimeForArtifactKind(latest.kind) };
}

import type { ArtifactVersion } from "../../artifacts/collect";

export type StoredArtifact = {
  content: string;
  name: string;
  title?: string;
  versions?: ArtifactVersion[];
  index?: number;
};

let currentArtifact: StoredArtifact | null = null;

export const artifactStore = {
  set(content: string, name: string, extra?: Omit<StoredArtifact, "content" | "name">): void {
    currentArtifact = { content, name, ...extra };
  },
  get(): StoredArtifact | null {
    return currentArtifact;
  },
  clear(): void {
    currentArtifact = null;
  },
};

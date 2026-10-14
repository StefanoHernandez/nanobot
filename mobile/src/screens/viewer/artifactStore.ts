export type StoredArtifact = {
  content: string;
  name: string;
};

let currentArtifact: StoredArtifact | null = null;

export const artifactStore = {
  set(content: string, name: string): void {
    currentArtifact = { content, name };
  },
  get(): StoredArtifact | null {
    return currentArtifact;
  },
  clear(): void {
    currentArtifact = null;
  },
};

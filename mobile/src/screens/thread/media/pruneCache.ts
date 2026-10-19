import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

export const RETENTION_DAYS = 14;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const MAX_MEDIA_CACHE_BYTES = 300 * 1024 * 1024; // 300 MB

export type PruneItem = {
  uri: string;
  size: number;
  modificationTime: number;
  deleted?: boolean;
  isDirectory?: boolean;
};

/**
 * Pure pruning logic operating on item descriptors.
 * 1. Deletes exports older than 14 days.
 * 2. Deletes media older than 14 days.
 * 3. If media is still over maxSizeBytes, deletes oldest media until under.
 */
export async function pruneCache(opts: {
  now?: number;
  exportsFiles: PruneItem[];
  mediaDirs: PruneItem[];
  maxSizeBytes?: number;
  retentionMs?: number;
  onDelete: (item: PruneItem) => void | Promise<void>;
}): Promise<{ deletedExports: number; deletedMedia: number }> {
  const now = opts.now ?? Date.now();
  const retention = opts.retentionMs ?? RETENTION_MS;
  const maxBytes = opts.maxSizeBytes ?? MAX_MEDIA_CACHE_BYTES;
  const cutoff = now - retention;

  let deletedExports = 0;
  let deletedMedia = 0;

  // 1. Delete exports older than 14 days
  for (const item of opts.exportsFiles) {
    if (item.modificationTime < cutoff) {
      await opts.onDelete(item);
      item.deleted = true;
      deletedExports++;
    }
  }

  // 2. Delete media entries older than 14 days
  const remainingMedia: PruneItem[] = [];
  for (const item of opts.mediaDirs) {
    if (item.modificationTime < cutoff) {
      await opts.onDelete(item);
      item.deleted = true;
      deletedMedia++;
    } else {
      remainingMedia.push(item);
    }
  }

  // 3. If media is still over maxBytes (300 MB), delete oldest until under
  let totalMediaBytes = remainingMedia.reduce((acc, it) => acc + (it.size || 0), 0);
  if (totalMediaBytes > maxBytes) {
    remainingMedia.sort((a, b) => a.modificationTime - b.modificationTime);
    for (const item of remainingMedia) {
      if (totalMediaBytes <= maxBytes) break;
      await opts.onDelete(item);
      item.deleted = true;
      totalMediaBytes -= item.size || 0;
      deletedMedia++;
    }
  }

  return { deletedExports, deletedMedia };
}

/**
 * Real filesystem prune for cache/exports/ and cache/media/<hash>/.
 */
export async function pruneMediaAndExports(now = Date.now()): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const exportsDir = new Directory(Paths.cache, "exports");
    const mediaDir = new Directory(Paths.cache, "media");

    const exportsFiles: PruneItem[] = [];
    if (exportsDir.exists) {
      try {
        const list = exportsDir.list();
        for (const entry of list) {
          if (entry instanceof File && entry.exists) {
            const mod = entry.lastModified ?? entry.modificationTime ?? 0;
            exportsFiles.push({
              uri: entry.uri,
              size: entry.size || 0,
              modificationTime: mod,
              isDirectory: false,
            });
          }
        }
      } catch {}
    }

    const mediaDirs: PruneItem[] = [];
    if (mediaDir.exists) {
      try {
        const list = mediaDir.list();
        for (const entry of list) {
          if (entry.exists) {
            let size = 0;
            let mod = 0;
            if (entry instanceof Directory) {
              const info = entry.info();
              size = info.size || 0;
              mod = info.modificationTime || 0;
              if (size === 0) {
                try {
                  const children = entry.list();
                  for (const child of children) {
                    if (child instanceof File && child.exists) {
                      size += child.size || 0;
                      const childMod = child.lastModified ?? child.modificationTime ?? 0;
                      if (childMod > mod) mod = childMod;
                    }
                  }
                } catch {}
              }
            } else if (entry instanceof File) {
              size = entry.size || 0;
              mod = entry.lastModified ?? entry.modificationTime ?? 0;
            }
            mediaDirs.push({
              uri: entry.uri,
              size,
              modificationTime: mod,
              isDirectory: entry instanceof Directory,
            });
          }
        }
      } catch {}
    }

    await pruneCache({
      now,
      exportsFiles,
      mediaDirs,
      maxSizeBytes: MAX_MEDIA_CACHE_BYTES,
      retentionMs: RETENTION_MS,
      onDelete: (item) => {
        try {
          if (item.isDirectory) {
            new Directory(item.uri).delete();
          } else {
            new File(item.uri).delete();
          }
        } catch {}
      },
    });
  } catch (e) {
    if (__DEV__) console.warn("Cache pruning error:", e);
  }
}

let pruneTriggered = false;

export function triggerCachePruneOnce(): void {
  if (pruneTriggered || Platform.OS === "web" || typeof jest !== "undefined") return;
  pruneTriggered = true;
  setTimeout(() => {
    void pruneMediaAndExports();
  }, 100);
}

export function resetPruneTriggerForTest(): void {
  pruneTriggered = false;
}

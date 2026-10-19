import "../../src/i18n";
import { pruneCache, pruneMediaAndExports } from "../../src/screens/thread/media/pruneCache";

describe("Cache pruning (PF-A)", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  type FakeItem = {
    uri: string;
    size: number;
    modificationTime: number;
    deleted: boolean;
    isDirectory?: boolean;
    items?: FakeItem[];
  };

  test("deletes entries older than 14 days in exports and media", async () => {
    const exportsFiles: FakeItem[] = [
      { uri: "file:///cache/exports/old.md", size: 1000, modificationTime: now - 15 * DAY_MS, deleted: false },
      { uri: "file:///cache/exports/recent.md", size: 2000, modificationTime: now - 2 * DAY_MS, deleted: false },
    ];

    const mediaDirs: FakeItem[] = [
      {
        uri: "file:///cache/media/hash-old",
        size: 5000,
        modificationTime: now - 20 * DAY_MS,
        deleted: false,
        isDirectory: true,
        items: [{ uri: "file:///cache/media/hash-old/pic.jpg", size: 5000, modificationTime: now - 20 * DAY_MS, deleted: false }],
      },
      {
        uri: "file:///cache/media/hash-recent",
        size: 10000,
        modificationTime: now - 3 * DAY_MS,
        deleted: false,
        isDirectory: true,
        items: [{ uri: "file:///cache/media/hash-recent/doc.pdf", size: 10000, modificationTime: now - 3 * DAY_MS, deleted: false }],
      },
    ];

    await pruneCache({
      now,
      exportsFiles,
      mediaDirs,
      maxSizeBytes: 300 * 1024 * 1024,
      onDelete: (item) => {
        item.deleted = true;
      },
    });

    expect(exportsFiles[0].deleted).toBe(true);
    expect(exportsFiles[1].deleted).toBe(false);
    expect(mediaDirs[0].deleted).toBe(true);
    expect(mediaDirs[1].deleted).toBe(false);
  });

  test("if media is still over 300 MB, deletes oldest until under 300 MB", async () => {
    const MB = 1024 * 1024;
    // 3 recent media items: 150 MB (10 days old), 120 MB (5 days old), 100 MB (1 day old)
    // Total = 370 MB > 300 MB.
    // Deleting oldest (150 MB) leaves 220 MB <= 300 MB.
    const mediaDirs: FakeItem[] = [
      {
        uri: "file:///cache/media/hash-1",
        size: 150 * MB,
        modificationTime: now - 10 * DAY_MS,
        deleted: false,
        isDirectory: true,
      },
      {
        uri: "file:///cache/media/hash-2",
        size: 120 * MB,
        modificationTime: now - 5 * DAY_MS,
        deleted: false,
        isDirectory: true,
      },
      {
        uri: "file:///cache/media/hash-3",
        size: 100 * MB,
        modificationTime: now - 1 * DAY_MS,
        deleted: false,
        isDirectory: true,
      },
    ];

    await pruneCache({
      now,
      exportsFiles: [],
      mediaDirs,
      maxSizeBytes: 300 * MB,
      onDelete: (item) => {
        item.deleted = true;
      },
    });

    expect(mediaDirs[0].deleted).toBe(true); // Oldest removed
    expect(mediaDirs[1].deleted).toBe(false);
    expect(mediaDirs[2].deleted).toBe(false);
  });
});

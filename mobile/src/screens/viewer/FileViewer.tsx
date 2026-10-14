import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { Button, IconButton, toast } from "../../ui/components";
import { Markdown } from "../../ui/markdown/Markdown";
import { CodeBlock } from "../../ui/markdown/CodeBlock";
import { openLocal, shareMedia } from "../thread/media/media";
import { langOf, parseCsv, prettyJson, viewerKind, type ViewerKind } from "./formats";
import { ArtifactWebView, type ArtifactKind } from "./ArtifactWebView";
import { artifactStore } from "./artifactStore";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_PREVIEW_CHARS = 200 * 1024; // 200 KB
const MAX_CSV_ROWS = 500;

export function isViewerUriAllowed(uri: string): boolean {
  if (!uri || typeof uri !== "string") return false;
  if (!uri.startsWith("file://")) return false;

  let decoded = uri;
  try {
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return false;
  }

  if (
    decoded.includes("/../") ||
    decoded.endsWith("/..") ||
    decoded.includes("\\..\\") ||
    decoded.endsWith("\\..") ||
    decoded.includes("/..\\") ||
    decoded.includes("\\../")
  ) {
    return false;
  }

  const cacheBase = (Paths.cache?.uri ?? "file:///cache").replace(/\/+$/, "");
  const mediaPrefix = `${cacheBase}/media/`;
  const artifactPrefix = `${cacheBase}/artifacts/`;
  const tempPrefix = `${cacheBase}/temp/`;

  return (
    decoded.startsWith(mediaPrefix) ||
    decoded.startsWith(artifactPrefix) ||
    decoded.startsWith(tempPrefix)
  );
}

export type FileViewerProps = {
  uri: string;
  name: string;
};

export function FileViewer({ uri, name }: FileViewerProps) {
  const t = useT();
  const th = useTheme();
  const insets = useSafeAreaInsets();

  // Code-block previews open with uri "" and read from artifactStore.
  const allowed = useMemo(() => (uri === "" && !!artifactStore.get()) || isViewerUriAllowed(uri), [uri]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const [content, setContent] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [artifactFallback, setArtifactFallback] = useState(false);
  const [forcePreviewLargeDoc, setForcePreviewLargeDoc] = useState(false);
  const [forcePreviewLargeText, setForcePreviewLargeText] = useState(false);

  const ext = useMemo(() => langOf(name), [name]);
  const kind = useMemo(() => viewerKind(name), [name]);

  const isArtifact = useMemo(
    () =>
      kind === "html" ||
      kind === "svg" ||
      kind === "mermaid" ||
      kind === "pdf" ||
      kind === "docx" ||
      kind === "pptx" ||
      kind === "xlsx",
    [kind]
  );

  useEffect(() => {
    let active = true;
    const stored = artifactStore.get();
    if ((!uri || uri === "") && stored) {
      setContent(stored.content);
      setFileSize(stored.content.length);
      setLoading(false);
      return;
    }

    const readFile = async () => {
      setLoading(true);
      setError(null);
      setTooLarge(false);
      setArtifactFallback(false);

      if (!allowed) {
        if (active) {
          setError(t("viewer.notAvailable", "File not available"));
          setLoading(false);
        }
        return;
      }

      try {
        const file = new File(uri);
        const size = file.size ?? 0;
        if (active) setFileSize(size);

        if (isArtifact) {
          if (kind === "html" || kind === "svg" || kind === "mermaid") {
            if (size <= 2 * 1024 * 1024 || size > 10 * 1024 * 1024) {
              const text = await file.text();
              if (active) setContent(text);
            }
          }
          if (active) setLoading(false);
          return;
        }

        if (size > MAX_FILE_SIZE) {
          if (active) {
            setTooLarge(true);
            setLoading(false);
          }
          return;
        }

        const text = await file.text();
        if (active) {
          setContent(text);
          setLoading(false);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    };

    void readFile();
    return () => {
      active = false;
    };
  }, [uri, isArtifact, kind, name, allowed]);

  const handleCopy = async () => {
    if (!allowed || !content) return;
    await Clipboard.setStringAsync(content);
    toast.show(t("viewer.copied"));
  };

  const handleShare = async () => {
    if (!allowed) return;
    try {
      await shareMedia(uri);
    } catch {
      toast.show(t("media.shareFailed"));
    }
  };

  const handleOpenWith = async () => {
    if (!allowed) return;
    try {
      await openLocal(uri, ext);
    } catch {
      toast.show(t("media.openFailed"));
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  // Truncation check for code, json, text
  const isTruncated = useMemo(() => {
    if (kind === "code" || kind === "json" || kind === "text") {
      return content.length > MAX_PREVIEW_CHARS;
    }
    return false;
  }, [kind, content.length]);

  const previewContent = useMemo(() => {
    if (isTruncated) {
      return content.slice(0, MAX_PREVIEW_CHARS);
    }
    return content;
  }, [content, isTruncated]);

  // Memoized JSON formatting
  const formattedJson = useMemo(() => {
    if (kind !== "json") return "";
    return prettyJson(previewContent);
  }, [kind, previewContent]);

  // Memoized CSV parsing
  const parsedCsvData = useMemo(() => {
    if (kind !== "csv") return { rows: [], colWidths: [], isCapped: false, totalRows: 0 };
    const sep = ext === "tsv" ? "\t" : ",";
    const allRows = parseCsv(content, sep);
    const header = allRows[0] ?? [];
    const total = Math.max(0, allRows.length - 1);
    const shownDataRows = allRows.slice(1, MAX_CSV_ROWS + 1);
    const capped = total > MAX_CSV_ROWS;

    // Combined rows to render (header at index 0)
    const displayRows = [header, ...shownDataRows];

    // Compute column widths: clamp(maxChars(col) * 8 + 16, 80, 240)
    const numCols = header.length;
    const colWidths = new Array<number>(numCols).fill(80);

    for (let c = 0; c < numCols; c++) {
      let maxLen = 0;
      for (let r = 0; r < displayRows.length; r++) {
        const cell = displayRows[r]?.[c] ?? "";
        if (cell.length > maxLen) {
          maxLen = cell.length;
        }
      }
      const w = Math.min(240, Math.max(80, maxLen * 8 + 16));
      colWidths[c] = w;
    }

    return {
      rows: displayRows,
      colWidths,
      isCapped: capped,
      totalRows: total,
    };
  }, [kind, ext, content]);

  const renderTruncationBanner = () => {
    if (!isTruncated) return null;
    return (
      <View
        style={[
          styles.truncationBanner,
          {
            backgroundColor: th.colors.muted,
            borderTopColor: th.colors.border,
            borderTopWidth: 1,
            marginBottom: insets.bottom,
          },
        ]}
      >
        <Text style={{ color: th.colors.mutedForeground, fontSize: 13 }}>
          {t("viewer.truncatedPreview")}
        </Text>
      </View>
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={th.colors.primary} />
        </View>
      );
    }

    if (!allowed) {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.messageText, { color: th.colors.destructive }]}>
            {t("viewer.notAvailable", "File not available")}
          </Text>
        </View>
      );
    }

    if (artifactFallback) {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.messageText, { color: th.colors.mutedForeground }]}>
            {t("artifact.notAvailable")}
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button title={t("viewer.openWith")} onPress={handleOpenWith} />
          </View>
        </View>
      );
    }

    if (tooLarge) {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.messageText, { color: th.colors.mutedForeground }]}>
            {t("viewer.tooLarge")}
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button title={t("viewer.openWith")} onPress={handleOpenWith} />
          </View>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.messageText, { color: th.colors.destructive }]}>
            {t("viewer.readError")}
          </Text>
          <Text style={[styles.detailText, { color: th.colors.mutedForeground }]}>
            {error}
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button title={t("viewer.openWith")} onPress={handleOpenWith} />
          </View>
        </View>
      );
    }

    // Artifacts & document preview kinds (P5-V1)
    if (isArtifact) {
      if (kind === "pdf") {
        return (
          <ArtifactWebView
            kind="pdf"
            uri={uri}
            name={name}
            fileSize={fileSize}
            onFallback={() => setArtifactFallback(true)}
          />
        );
      }

      if (kind === "docx" || kind === "pptx" || kind === "xlsx") {
        if (fileSize > 150 * 1024 * 1024) {
          return (
            <ArtifactWebView
              kind={kind}
              uri={uri}
              name={name}
              fileSize={fileSize}
              isLightPreview={true}
              onFallback={() => setArtifactFallback(true)}
            />
          );
        }

        if (fileSize > 50 * 1024 * 1024 && !forcePreviewLargeDoc) {
          const sizeMb = Math.round(fileSize / (1024 * 1024));
          return (
            <View style={styles.centerContainer}>
              <Text style={[styles.messageText, { color: th.colors.foreground }]}>
                {t("artifact.largeFileNotice", { size: sizeMb })}
              </Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                <Button
                  title={t("artifact.openPreview")}
                  onPress={() => setForcePreviewLargeDoc(true)}
                />
                <Button
                  title={t("viewer.openWith")}
                  variant="ghost"
                  onPress={handleOpenWith}
                />
              </View>
            </View>
          );
        }

        return (
          <ArtifactWebView
            kind={kind}
            uri={uri}
            name={name}
            fileSize={fileSize}
            onFallback={() => setArtifactFallback(true)}
          />
        );
      }

      if (kind === "html" || kind === "svg" || kind === "mermaid") {
        if (fileSize > 10 * 1024 * 1024 && !forcePreviewLargeText) {
          return (
            <View style={{ flex: 1 }}>
              <View
                style={[
                  styles.largeNoticeBar,
                  {
                    backgroundColor: th.colors.muted,
                    borderBottomColor: th.colors.border,
                    borderBottomWidth: 1,
                    padding: 8,
                    alignItems: "center",
                  },
                ]}
              >
                <Button
                  title={t("artifact.previewAnyway")}
                  onPress={() => setForcePreviewLargeText(true)}
                />
              </View>
              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 16 }]}
              >
                <CodeBlock code={previewContent} lang={ext} />
              </ScrollView>
              {renderTruncationBanner()}
            </View>
          );
        }

        return (
          <ArtifactWebView
            kind={kind}
            uri={uri}
            html={fileSize <= 2 * 1024 * 1024 ? content : undefined}
            name={name}
            fileSize={fileSize}
            onFallback={() => setArtifactFallback(true)}
          />
        );
      }
    }

    if (kind === "markdown") {
      return (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 16 }]}
        >
          <Markdown text={content} />
        </ScrollView>
      );
    }

    if (kind === "code") {
      return (
        <View style={{ flex: 1 }}>
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 16 }]}
          >
            <CodeBlock code={previewContent} lang={ext} />
          </ScrollView>
          {renderTruncationBanner()}
        </View>
      );
    }

    if (kind === "json") {
      return (
        <View style={{ flex: 1 }}>
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 16 }]}
          >
            <CodeBlock code={formattedJson} lang="json" />
          </ScrollView>
          {renderTruncationBanner()}
        </View>
      );
    }

    if (kind === "csv") {
      const { rows, colWidths, isCapped, totalRows } = parsedCsvData;

      return (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal style={styles.scrollArea}>
            <FlatList
              data={rows}
              keyExtractor={(_item, index) => String(index)}
              stickyHeaderIndices={[0]}
              nestedScrollEnabled
              contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
              renderItem={({ item, index }) => {
                const isHeader = index === 0;
                return (
                  <View
                    style={[
                      styles.tableRow,
                      {
                        backgroundColor: isHeader
                          ? th.colors.muted
                          : index % 2 === 1
                            ? th.colors.muted
                            : th.colors.background,
                        borderBottomColor: th.colors.border,
                        borderBottomWidth: 1,
                      },
                    ]}
                  >
                    {item.map((cell, cIdx) => {
                      const w = colWidths[cIdx] ?? 80;
                      return (
                        <View
                          key={cIdx}
                          style={[
                            styles.tableCell,
                            {
                              width: w,
                              borderRightColor: th.colors.border,
                              borderRightWidth: cIdx < item.length - 1 ? 1 : 0,
                            },
                          ]}
                        >
                          <Text
                            numberOfLines={isHeader ? 2 : 4}
                            ellipsizeMode="tail"
                            style={[
                              styles.cellText,
                              {
                                color: th.colors.foreground,
                                fontFamily: isHeader ? th.font.medium : th.font.regular,
                                fontWeight: isHeader ? "700" : "normal",
                              },
                            ]}
                          >
                            {cell}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              }}
            />
          </ScrollView>

          {isCapped && (
            <View
              style={[
                styles.capBanner,
                {
                  backgroundColor: th.colors.muted,
                  borderTopColor: th.colors.border,
                  borderTopWidth: 1,
                  marginBottom: insets.bottom,
                },
              ]}
            >
              <Text style={{ color: th.colors.mutedForeground, fontSize: 12 }}>
                {t("viewer.showingRows", { shown: MAX_CSV_ROWS, total: totalRows })}
              </Text>
            </View>
          )}
        </View>
      );
    }

    // Default: text
    return (
      <View style={{ flex: 1 }}>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 16 }]}
        >
          <Text
            selectable
            style={{
              fontFamily: th.font.mono,
              fontSize: 13,
              lineHeight: 19,
              color: th.colors.foreground,
            }}
          >
            {previewContent}
          </Text>
        </ScrollView>
        {renderTruncationBanner()}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: th.colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: th.colors.border,
            borderBottomWidth: 1,
          },
        ]}
      >
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={handleBack}
          accessibilityLabel={t("thread.back")}
        />

        <Text
          numberOfLines={1}
          ellipsizeMode="middle"
          style={[
            styles.title,
            {
              color: th.colors.foreground,
              fontFamily: th.font.medium,
            },
          ]}
        >
          {name}
        </Text>

        {allowed ? (
          <View style={styles.actions}>
            <IconButton
              icon="content-copy"
              size={22}
              onPress={handleCopy}
              accessibilityLabel={t("viewer.copy")}
              disabled={loading || tooLarge || !!error || !content}
            />
            <IconButton
              icon="share-variant-outline"
              size={22}
              onPress={handleShare}
              accessibilityLabel={t("viewer.share")}
            />
            <IconButton
              icon="open-in-new"
              size={22}
              onPress={handleOpenWith}
              accessibilityLabel={t("viewer.openWith")}
            />
          </View>
        ) : null}
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>{renderBody()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    height: 56,
  },
  title: {
    flex: 1,
    fontSize: 16,
    marginHorizontal: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  messageText: {
    fontSize: 16,
    textAlign: "center",
  },
  detailText: {
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  scrollArea: {
    flex: 1,
  },
  contentPadding: {
    padding: 16,
  },
  tableRow: {
    flexDirection: "row",
    minHeight: 40,
    alignItems: "center",
  },
  tableCell: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
  },
  cellText: {
    fontSize: 13,
  },
  capBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  truncationBanner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  largeNoticeBar: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
});

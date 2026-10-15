import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Print from "expo-print";
import { useStore } from "zustand";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { Button, Dialog, IconButton, TextField, toast } from "../../ui/components";
import { artifactFixText, freshArtifactId } from "../../artifacts/fix";
import { printDocument, writePng, writePreview } from "./exportArtifact";
import { lockViewer } from "./orientation";
import { isWritable } from "../../state/chatsStore";
import { useSession } from "../../state/sessionStore";
import { threadStore } from "../../state/threadStore";
import { Markdown } from "../../ui/markdown/Markdown";
import { CodeBlock } from "../../ui/markdown/CodeBlock";
import { openLocal, shareMedia } from "../thread/media/media";
import { langOf, parseCsv, prettyJson, viewerKind, type ViewerKind } from "./formats";
import { ArtifactWebView, type ArtifactKind } from "./ArtifactWebView";
import { artifactStore } from "./artifactStore";
import { markdownToPrintHtml, paginateMarkdown } from "./readingPages";

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
  /** Source chat. The route carries the key only, never the artifact body. */
  chatKey?: string;
};

export function FileViewer({ uri, name, chatKey = "" }: FileViewerProps) {
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
  const opened = useMemo(() => (uri ? null : artifactStore.get()), [uri]);
  const versions = opened?.versions && opened.versions.length > 1 ? opened.versions : null;
  const [versionIndex, setVersionIndex] = useState(opened?.index ?? 0);
  const [compare, setCompare] = useState(false);
  const activeVersion = versions?.[versionIndex];
  const { session } = useSession();
  const threadLoaded = useStore(threadStore, (s) => !!chatKey && !!s.threads[chatKey]);
  const canAsk = !uri && !!chatKey && threadLoaded && isWritable(chatKey) && !!session;
  const [fixError, setFixError] = useState<{ message: string; line?: number } | null>(null);
  const [ask, setAsk] = useState("");
  const sending = useRef(false);
  const [wide, setWide] = useState(false);
  const [fit, setFit] = useState(true);
  const [pngTicket, setPngTicket] = useState(0);
  const [pngBusy, setPngBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [network, setNetwork] = useState(false);
  const [askNetwork, setAskNetwork] = useState(false);

  const ext = useMemo(() => langOf(name), [name]);
  const kind = useMemo(() => viewerKind(name), [name]);
  const isReadingView = name === "answer.md" && uri === "";
  const readingPages = useMemo(
    () => (isReadingView ? paginateMarkdown(content) : []),
    [isReadingView, content]
  );
  const [pageIndex, setPageIndex] = useState(0);
  const toolKind = activeVersion?.kind ?? kind;
  const canFit = toolKind === "html";
  const canPng = toolKind === "svg" || toolKind === "mermaid";
  const canPdf = toolKind === "html" || toolKind === "svg";
  const canNetwork = toolKind === "html" || toolKind === "svg" || toolKind === "mermaid" || toolKind === "map";

  useEffect(() => {
    setNetwork(false);
    setAskNetwork(false);
  }, [name, opened?.id]);

  useEffect(() => {
    setPageIndex(0);
  }, [content, isReadingView]);

  useEffect(() => {
    return () => {
      void lockViewer(false).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!pngBusy) return;
    const id = setTimeout(() => setPngBusy(false), 8000);
    return () => clearTimeout(id);
  }, [pngBusy]);

  const isArtifact = useMemo(
    () =>
      kind === "html" ||
      kind === "svg" ||
      kind === "mermaid" ||
      kind === "chart" ||
      kind === "map" ||
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
          if (kind === "html" || kind === "svg" || kind === "mermaid" || kind === "chart" || kind === "map") {
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
    const text = activeVersion?.code ?? content;
    if (!allowed || !text) return;
    await Clipboard.setStringAsync(text);
    toast.show(t("viewer.copied"));
  };

  const handleShare = async () => {
    if (!allowed) return;
    try {
      const local = uri || writePreview(name, activeVersion?.code ?? content);
      if (!local) {
        toast.show(t("media.shareFailed"));
        return;
      }
      await shareMedia(local);
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

  const sendToChat = (request?: string) => {
    if (!canAsk || !session || sending.current) return;
    const previewKind =
      activeVersion?.kind ??
      (kind === "svg" || kind === "mermaid" || kind === "chart" || kind === "map" || kind === "html" ? kind : "html");
    const text = artifactFixText({
      id: opened?.id || freshArtifactId(previewKind),
      kind: previewKind,
      index: versions ? versionIndex : undefined,
      total: versions?.length,
      error: request ? undefined : fixError?.message,
      line: request ? undefined : fixError?.line,
      request,
    });
    sending.current = true;
    const ok = threadStore.getState().send(session, chatKey, text);
    sending.current = false;
    if (!ok) {
      toast.show(t("artifact.sendFailed"));
      return;
    }
    setAsk("");
    toast.show(t("artifact.sent"));
    handleBack();
  };

  const toggleWide = () => {
    const next = !wide;
    void lockViewer(next)
      .then(() => setWide(next))
      .catch(() => toast.show(t("artifact.rotateFailed")));
  };

  const requestPng = () => {
    if (pngBusy) return;
    setPngBusy(true);
    setPngTicket((n) => n + 1);
  };

  const acceptPng = (dataUrl: string) => {
    setPngBusy(false);
    try {
      const saved = writePng(dataUrl);
      if (!saved) {
        toast.show(t("artifact.exportFailed"));
        return;
      }
      void shareMedia(saved).catch(() => toast.show(t("artifact.exportFailed")));
    } catch {
      toast.show(t("artifact.exportFailed"));
    }
  };

  const savePdf = () => {
    if (pdfBusy) return;
    const body = activeVersion?.code ?? content;
    if (!body.trim()) return;
    setPdfBusy(true);
    const html = isReadingView ? markdownToPrintHtml(content) : printDocument(body);
    void Print.printToFileAsync({ html })
      .then((result) => {
        const out = result.uri;
        if (!out.startsWith("file://") || out.includes("..")) throw new Error("export");
        return shareMedia(out);
      })
      .catch(() => toast.show(t("artifact.exportFailed")))
      .finally(() => setPdfBusy(false));
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
        <Text style={{ color: th.colors.mutedForeground, fontSize: 13, fontFamily: th.font.regular }}>
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
          <Text style={[styles.messageText, { color: th.colors.destructive, fontFamily: th.font.regular }]}>
            {t("viewer.notAvailable", "File not available")}
          </Text>
        </View>
      );
    }

    if (artifactFallback) {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.messageText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
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
          <Text style={[styles.messageText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
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
          <Text style={[styles.messageText, { color: th.colors.destructive, fontFamily: th.font.regular }]}>
            {t("viewer.readError")}
          </Text>
          <Text style={[styles.detailText, { color: th.colors.mutedForeground, fontFamily: th.font.mono }]}>
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
              <Text style={[styles.messageText, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
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

      if (kind === "html" || kind === "svg" || kind === "mermaid" || kind === "chart" || kind === "map") {
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

        const viewKind = activeVersion?.kind ?? kind;
        const viewHtml = activeVersion?.code ?? (fileSize <= 2 * 1024 * 1024 ? content : undefined);
        const otherIndex = versionIndex === 0 ? 1 : versionIndex - 1;
        return (
          <View style={{ flex: 1 }}>
            {versions ? (
              <View style={{ flexDirection: "row", alignItems: "center", minHeight: 48, paddingRight: 8 }}>
                <IconButton
                  icon="chevron-left"
                  accessibilityLabel={t("artifact.prevVersion")}
                  disabled={versionIndex === 0}
                  onPress={() => {
                    setCompare(false);
                    setVersionIndex((i) => Math.max(0, i - 1));
                  }}
                />
                <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 14 }}>
                  {t("artifact.version", { current: versionIndex + 1, total: versions.length })}
                </Text>
                <IconButton
                  icon="chevron-right"
                  accessibilityLabel={t("artifact.nextVersion")}
                  disabled={versionIndex >= versions.length - 1}
                  onPress={() => {
                    setCompare(false);
                    setVersionIndex((i) => Math.min(versions.length - 1, i + 1));
                  }}
                />
                <View style={{ flex: 1 }} />
                <Button
                  title={compare ? t("artifact.compareOff") : t("artifact.compare")}
                  variant="ghost"
                  onPress={() => setCompare((on) => !on)}
                />
              </View>
            ) : null}
            {compare && versions && versions[otherIndex] ? (
              <View style={{ flex: 1, flexDirection: "row" }}>
                <View style={{ flex: 1 }}>
                  <ArtifactWebView
                    key={`cmp-${otherIndex}`}
                    kind={versions[otherIndex].kind}
                    html={versions[otherIndex].code}
                    name={name}
                    fit={fit}
                    network={network}
                    onError={canAsk ? setFixError : undefined}
                    onFallback={() => setArtifactFallback(true)}
                  />
                </View>
                <View style={{ width: 1, backgroundColor: th.colors.border }} />
                <View style={{ flex: 1 }}>
                  <ArtifactWebView
                    key={`cmp-${versionIndex}`}
                    kind={viewKind}
                    html={viewHtml}
                    name={name}
                    fit={fit}
                    network={network}
                    pngTicket={pngTicket}
                    onPng={acceptPng}
                    onError={canAsk ? setFixError : undefined}
                    onFallback={() => setArtifactFallback(true)}
                  />
                </View>
              </View>
            ) : (
              <ArtifactWebView
                kind={viewKind}
                uri={versions ? "" : uri}
                html={viewHtml}
                name={name}
                fileSize={activeVersion ? (viewHtml?.length ?? 0) : fileSize}
                fit={fit}
                network={canNetwork ? network : false}
                pngTicket={pngTicket}
                onPng={acceptPng}
                onError={canAsk ? setFixError : undefined}
                onFallback={() => setArtifactFallback(true)}
              />
            )}
          </View>
        );
      }
    }

    if (kind === "markdown") {
      if (isReadingView) {
        const pageText = readingPages[pageIndex] ?? "";
        return (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[styles.contentPadding, { paddingBottom: 16 }]}
          >
            <Markdown text={pageText} />
          </ScrollView>
        );
      }
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
              <Text style={{ color: th.colors.mutedForeground, fontSize: 13, fontFamily: th.font.regular }}>
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

  const showTools = allowed && !artifactFallback && !loading && !error && !tooLarge && (canFit || canPng || canPdf || canNetwork);
  const toolRow = showTools ? (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 8, gap: 4, borderBottomWidth: 1, borderBottomColor: th.colors.border }}>
      <IconButton
        icon={wide ? "phone-rotate-portrait" : "phone-rotate-landscape"}
        size={22}
        onPress={toggleWide}
        accessibilityLabel={wide ? t("artifact.portrait") : t("artifact.rotate")}
      />
      {canFit ? <Button title={fit ? t("artifact.actualSize") : t("artifact.fit")} variant="ghost" onPress={() => setFit((v) => !v)} /> : null}
      {canPng ? (
        <IconButton icon="image-outline" size={22} onPress={requestPng} disabled={pngBusy} accessibilityLabel={t("artifact.exportPng")} />
      ) : null}
      {canPdf ? (
        <IconButton icon="file-pdf-box" size={22} onPress={savePdf} disabled={pdfBusy} accessibilityLabel={t("artifact.exportPdf")} />
      ) : null}
      {canNetwork ? (
        <View style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
          <Switch
            accessibilityLabel={network ? t("artifact.networkOn") : t("artifact.network")}
            value={network || askNetwork}
            onValueChange={(on) => {
              if (on) setAskNetwork(true);
              else {
                setAskNetwork(false);
                setNetwork(false);
              }
            }}
          />
        </View>
      ) : null}
    </View>
  ) : null;

  const readingBar =
    isReadingView && allowed && !loading && !error && !tooLarge ? (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 48,
          paddingHorizontal: 4,
          borderTopWidth: 1,
          borderTopColor: th.colors.border,
          backgroundColor: th.colors.background,
          paddingBottom: insets.bottom,
        }}
      >
        {readingPages.length > 1 ? (
          <>
            <IconButton
              icon="chevron-left"
              accessibilityLabel={t("artifact.prevPage")}
              disabled={pageIndex === 0}
              onPress={() => setPageIndex((i) => Math.max(0, i - 1))}
            />
            <Text
              style={{
                flex: 1,
                textAlign: "center",
                color: th.colors.foreground,
                fontFamily: th.font.regular,
                fontSize: 14,
              }}
            >
              {t("artifact.page", { current: pageIndex + 1, total: readingPages.length })}
            </Text>
            <IconButton
              icon="chevron-right"
              accessibilityLabel={t("artifact.nextPage")}
              disabled={pageIndex >= readingPages.length - 1}
              onPress={() => setPageIndex((i) => Math.min(readingPages.length - 1, i + 1))}
            />
          </>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <IconButton
          icon="file-pdf-box"
          accessibilityLabel={t("artifact.exportPdf")}
          disabled={pdfBusy || !content.trim()}
          onPress={savePdf}
        />
      </View>
    ) : null;

  const fixBar = canAsk ? (
    <View style={{ borderTopWidth: 1, borderTopColor: th.colors.border, paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 8, gap: 8, backgroundColor: th.colors.background }}>
      {fixError ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: th.colors.destructive, fontFamily: th.font.medium, fontSize: 14 }}>{t("artifact.errorTitle")}</Text>
          {fixError.message ? (
            <Text numberOfLines={3} style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 14 }}>
              {fixError.line ? `${fixError.message} (${fixError.line})` : fixError.message}
            </Text>
          ) : null}
          <Button title={t("artifact.fix")} onPress={() => sendToChat()} />
        </View>
      ) : null}
      <TextField label={t("artifact.askPlaceholder")} value={ask} onChangeText={setAsk} />
      <Button title={t("artifact.ask")} variant="secondary" disabled={!ask.trim()} onPress={() => sendToChat(ask)} />
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: th.colors.background, paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
          {activeVersion?.title || opened?.title || name}
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

      {toolRow}
      {/* Body */}
      <View style={{ flex: 1 }}>{renderBody()}</View>
      {readingBar}
      <Dialog
        open={askNetwork}
        title={t("artifact.networkTitle")}
        message={t("artifact.networkBody")}
        confirmLabel={t("artifact.networkAllow")}
        cancelLabel={t("artifact.cancel")}
        onConfirm={() => {
          setNetwork(true);
          setAskNetwork(false);
        }}
        onCancel={() => setAskNetwork(false)}
      />
      {fixBar}
      </KeyboardAvoidingView>
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

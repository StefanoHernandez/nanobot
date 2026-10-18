import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useT } from "../../i18n";
import { Button } from "../components/Button";
import { IconButton } from "../components/IconButton";
import { toast } from "../components/Toast";
import { syntaxColors } from "../syntaxTheme";
import { useTheme } from "../ThemeProvider";
import { artifactStore } from "../../screens/viewer/artifactStore";
import { collectArtifacts, fenceCode, isPreviewKind, locateVersion, parseFenceInfo } from "../../artifacts/collect";
import { threadStore } from "../../state/threadStore";

// ponytail: one generic regex tokenizer (comments, strings, numbers, common keywords) for all C-like/python/shell-ish
// languages instead of highlight.js (~100KB+ and an HTML-to-RN mapping). Per-language grammars if accuracy matters.
const KEYWORDS = "async|await|break|case|catch|class|const|continue|def|default|del|elif|else|enum|export|extends|false|finally|fn|for|from|func|function|if|impl|import|in|interface|is|lambda|let|match|new|none|None|not|null|or|and|package|pass|pub|raise|return|self|static|struct|super|switch|this|throw|true|True|False|try|type|use|var|void|while|with|yield";
const TOKEN = new RegExp(
  `(\\/\\/.*|#.*|\\/\\*[\\s\\S]*?\\*\\/)|("(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`(?:\\\\.|[^\`\\\\])*\`)|\\b(\\d+(?:\\.\\d+)?)\\b|\\b(${KEYWORDS})\\b`,
  "g",
);

// Above this size highlighting is skipped (regex scan + thousands of Text nodes stall the JS thread).
const MAX_HIGHLIGHT = 20000;

type Seg = { text: string; kind: "plain" | "comment" | "string" | "number" | "keyword" };
export function tokenize(code: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    if (m.index > last) out.push({ text: code.slice(last, m.index), kind: "plain" });
    out.push({ text: m[0], kind: m[1] ? "comment" : m[2] ? "string" : m[3] ? "number" : "keyword" });
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push({ text: code.slice(last), kind: "plain" });
  return out;
}

function artifactIcon(lang: string): React.ComponentProps<typeof MaterialCommunityIcons>["name"] {
  switch (lang) {
    case "html":
      return "language-html5";
    case "svg":
      return "svg";
    case "mermaid":
      return "chart-timeline-variant";
    case "chart":
      return "chart-bar";
    case "map":
      return "map-outline";
    case "react":
      return "react";
    default:
      return "file-code-outline";
  }
}

export function CodeBlock({
  code,
  lang,
  chatKey,
  messageId,
  isStreaming,
}: {
  code: string;
  lang?: string;
  chatKey?: string;
  messageId?: string;
  isStreaming?: boolean;
}) {
  const th = useTheme();
  const t = useT();
  const [showCode, setShowCode] = useState(false);
  const plain = code.length > MAX_HIGHLIGHT;
  const segs = useMemo(() => (plain ? [] : tokenize(code)), [code, plain]);
  const pal = syntaxColors[th.scheme];
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    toast.show(t("thread.copied"));
  };

  const info = parseFenceInfo(lang);
  const canPreview = isPreviewKind(info.lang);

  const openPreview = () => {
    const ext =
      info.lang === "mermaid"
        ? "mmd"
        : info.lang === "chart"
          ? "vl"
          : info.lang === "map"
            ? "geojson"
            : info.lang;
    const name = `preview.${ext}`;
    const messages = chatKey ? threadStore.getState().threads[chatKey]?.messages ?? [] : [];
    const found = locateVersion(collectArtifacts(messages), { id: info.id, code, messageId });
    const versions = found?.artifact.explicit && found.artifact.versions.length > 1 ? found.artifact.versions : undefined;
    artifactStore.set(fenceCode(code), name, {
      id: info.id ?? (found?.artifact.explicit ? found.artifact.id : undefined),
      title: found?.artifact.title ?? info.title,
      versions,
      index: versions ? found?.index : undefined,
    });
    router.push({ pathname: "/viewer", params: chatKey ? { name, chat: chatKey } : { name } });
  };

  if (!canPreview) {
    return (
      <View style={{ marginVertical: 6, backgroundColor: th.colors.muted, borderRadius: th.radius.md, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 12 }}>
          <Text style={{ color: th.colors.mutedForeground, fontSize: 12 }}>{info.title ?? info.lang}</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconButton icon="content-copy" size={18} onPress={copy} accessibilityLabel={t("thread.copyCode")} />
          </View>
        </View>
        <ScrollView horizontal>
          <Text selectable style={{ fontFamily: th.font.mono, fontSize: 13, lineHeight: 19, color: th.colors.foreground, padding: 12, paddingTop: 0 }}>
            {plain ? code : segs.map((s, i) => (s.kind === "plain" ? s.text : <Text key={i} style={{ color: pal[s.kind] }}>{s.text}</Text>))}
          </Text>
        </ScrollView>
      </View>
    );
  }

  const messages = chatKey ? threadStore.getState().threads[chatKey]?.messages ?? [] : [];
  const found = locateVersion(collectArtifacts(messages), { id: info.id, code, messageId });
  const title = info.title ?? found?.artifact.title ?? info.lang;
  const versions = found?.artifact.explicit && found.artifact.versions.length > 1 ? found.artifact.versions : undefined;
  const versionBadge = versions && versions.length > 1 ? `v${(found?.index ?? 0) + 1}` : null;
  const lineCount = code ? code.split("\n").length : 0;

  const streamingFromStore =
    chatKey && messageId
      ? !!threadStore.getState().threads[chatKey]?.messages?.find((m) => m.id === messageId)?.isStreaming
      : false;
  const streaming = isStreaming ?? streamingFromStore;

  if (streaming) {
    return (
      <View
        testID="artifact-streaming"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginVertical: 6,
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
          borderWidth: 1,
          borderColor: th.colors.border,
        }}
      >
        <ActivityIndicator size="small" color={th.colors.primary} />
        <Text style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 14 }}>
          {t("artifact.generating", { title, defaultValue: `Sto generando «${title}»…` })}
        </Text>
      </View>
    );
  }

  const lineCountText =
    lineCount === 1
      ? t("artifact.lineCount_one", { count: 1, defaultValue: "1 riga" })
      : t("artifact.lineCount", { count: lineCount, defaultValue: `${lineCount} righe` });

  return (
    <View
      testID="artifact-card"
      style={{
        marginVertical: 6,
        padding: 14,
        backgroundColor: th.colors.card,
        borderRadius: th.radius.md,
        borderWidth: 1,
        borderColor: th.colors.border,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 8 }}>
          <MaterialCommunityIcons name={artifactIcon(info.lang)} size={22} color={th.colors.primary} />
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text
              numberOfLines={1}
              style={{
                color: th.colors.foreground,
                fontFamily: th.font.medium,
                fontSize: 15,
              }}
            >
              {title}
            </Text>
            {versionBadge && (
              <View
                testID="artifact-version-badge"
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  backgroundColor: th.colors.muted,
                }}
              >
                <Text style={{ color: th.colors.mutedForeground, fontSize: 11, fontFamily: th.font.mono }}>
                  {versionBadge}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text style={{ color: th.colors.mutedForeground, fontSize: 12, fontFamily: th.font.regular }}>
          {lineCountText}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }} testID="artifact-open-preview">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("artifact.openPreview", "Apri anteprima")}
            onPress={openPreview}
            style={({ pressed }) => [
              {
                minHeight: 48,
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: th.colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <Text style={{ color: th.colors.primaryForeground, fontFamily: th.font.medium, fontSize: 15, letterSpacing: 0.2 }}>
              {t("artifact.openPreview", "Apri anteprima")}
            </Text>
          </Pressable>
        </View>
        <Pressable
          testID="artifact-code-toggle"
          accessibilityRole="button"
          onPress={() => setShowCode((prev) => !prev)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingVertical: 10,
            paddingHorizontal: 12,
            minHeight: 48,
          }}
        >
          <MaterialCommunityIcons
            name={showCode ? "chevron-up" : "chevron-down"}
            size={18}
            color={th.colors.mutedForeground}
          />
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.medium, fontSize: 13 }}>
            {showCode ? t("artifact.hideCode", "Nascondi codice") : t("artifact.showCode", "Mostra codice")}
          </Text>
        </Pressable>
      </View>

      {showCode && (
        <View
          testID="artifact-code-view"
          style={{
            borderTopWidth: 1,
            borderTopColor: th.colors.border,
            paddingTop: 8,
            backgroundColor: th.colors.muted,
            borderRadius: th.radius.sm,
            overflow: "hidden",
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingRight: 4 }}>
            <IconButton icon="content-copy" size={18} onPress={copy} accessibilityLabel={t("thread.copyCode")} />
          </View>
          <ScrollView horizontal>
            <Text
              selectable
              style={{
                fontFamily: th.font.mono,
                fontSize: 13,
                lineHeight: 19,
                color: th.colors.foreground,
                padding: 12,
                paddingTop: 0,
              }}
            >
              {plain
                ? code
                : segs.map((s, i) =>
                    s.kind === "plain" ? s.text : <Text key={i} style={{ color: pal[s.kind] }}>{s.text}</Text>,
                  )}
            </Text>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

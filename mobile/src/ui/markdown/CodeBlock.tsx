import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useT } from "../../i18n";
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

export function CodeBlock({ code, lang, chatKey, messageId }: { code: string; lang?: string; chatKey?: string; messageId?: string }) {
  const th = useTheme();
  const t = useT();
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
    const ext = info.lang === "mermaid" ? "mmd" : info.lang === "chart" ? "vl" : info.lang;
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

  return (
    <View style={{ marginVertical: 6, backgroundColor: th.colors.muted, borderRadius: th.radius.md, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 12 }}>
        <Text style={{ color: th.colors.mutedForeground, fontSize: 12 }}>{info.title ?? info.lang}</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {canPreview && (
            <IconButton
              icon="eye-outline"
              size={18}
              onPress={openPreview}
              accessibilityLabel={t("artifact.preview")}
            />
          )}
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

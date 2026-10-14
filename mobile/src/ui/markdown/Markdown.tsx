import React, { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { marked, type Token, type Tokens } from "marked";
import { useTheme } from "../ThemeProvider";
import type { Theme } from "../theme";
import { CodeBlock } from "./CodeBlock";
import { MathBlock } from "./MathBlock";

// Only these schemes are ever handed to the OS; javascript:, intent:, file: etc. are ignored.
const SAFE_LINK = /^(https?:|mailto:)/i;
const openLink = (href: string) => {
  if (SAFE_LINK.test(href)) Linking.openURL(href).catch(() => {});
};

type Ctx = { th: Theme; base: number };

function Inline({ tokens, ctx }: { tokens?: Token[]; ctx: Ctx }): React.ReactElement {
  const { th } = ctx;
  return (
    <>
      {(tokens ?? []).map((t, i) => {
        switch (t.type) {
          case "strong":
            return <Text key={i} style={{ fontFamily: th.font.medium }}><Inline tokens={(t as Tokens.Strong).tokens} ctx={ctx} /></Text>;
          case "em":
            return <Text key={i} style={{ fontStyle: "italic" }}><Inline tokens={(t as Tokens.Em).tokens} ctx={ctx} /></Text>;
          case "del":
            return <Text key={i} style={{ textDecorationLine: "line-through" }}><Inline tokens={(t as Tokens.Del).tokens} ctx={ctx} /></Text>;
          case "codespan":
            return <Text key={i} style={{ fontFamily: th.font.mono, backgroundColor: th.colors.muted, fontSize: ctx.base - 1 }}>{(t as Tokens.Codespan).text}</Text>;
          case "link": {
            const l = t as Tokens.Link;
            return <Text key={i} accessibilityRole="link" onPress={() => openLink(l.href)} style={{ color: th.colors.primary, textDecorationLine: "underline" }}><Inline tokens={l.tokens} ctx={ctx} /></Text>;
          }
          case "br":
            return <Text key={i}>{"\n"}</Text>;
          case "image":
            return <Text key={i}>{(t as Tokens.Image).text}</Text>;
          default: {
            const x = t as Tokens.Text;
            return x.tokens?.length ? <Inline key={i} tokens={x.tokens} ctx={ctx} /> : <Text key={i}>{x.text ?? x.raw}</Text>;
          }
        }
      })}
    </>
  );
}

function Blocks({ tokens, ctx, top }: { tokens: Token[]; ctx: Ctx; top?: boolean }): React.ReactElement {
  const { th, base } = ctx;
  const body = { color: th.colors.foreground, fontFamily: th.font.regular, fontSize: base, lineHeight: base * 1.5 };
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case "space":
            return null;
          case "heading": {
            const h = t as Tokens.Heading;
            return <Text key={i} style={[body, { fontFamily: h.depth <= 3 ? th.font.displayBold : th.font.medium, fontSize: base + Math.max(0, 5 - h.depth) * 2, lineHeight: (base + Math.max(0, 5 - h.depth) * 2) * 1.25, marginTop: 10 }]}><Inline tokens={h.tokens} ctx={ctx} /></Text>;
          }
          case "paragraph":
          case "text": {
            const p = t as Tokens.Paragraph;
            // block math lives only in top-level prose; code/codespan tokens never reach this branch
            if (top && t.type === "paragraph" && /\$\$[\s\S]+?\$\$/.test(p.text))
              return <MathSplit key={i} text={p.text} ctx={ctx} />;
            return <Text key={i} style={[body, styles.gap]}><Inline tokens={p.tokens} ctx={ctx} /></Text>;
          }
          case "code": {
            const c = t as Tokens.Code;
            return <CodeBlock key={i} code={c.text} lang={c.lang} />;
          }
          case "blockquote":
            return <View key={i} style={[styles.quote, { borderLeftColor: th.colors.border }]}><Blocks tokens={(t as Tokens.Blockquote).tokens} ctx={ctx} /></View>;
          case "list": {
            const l = t as Tokens.List;
            return (
              <View key={i} style={styles.gap}>
                {l.items.map((it, j) => (
                  <View key={j} style={styles.li}>
                    <Text style={[body, { width: 24 }]}>{l.ordered ? `${Number(l.start || 1) + j}.` : "•"}</Text>
                    <View style={{ flex: 1 }}><Blocks tokens={it.tokens} ctx={ctx} /></View>
                  </View>
                ))}
              </View>
            );
          }
          case "table": {
            const tb = t as Tokens.Table;
            // one width per column so rows line up: longest cell text, clamped
            const widths = tb.header.map((_, j) =>
              Math.min(220, Math.max(80, Math.max(tb.header[j].text.length, ...tb.rows.map((r) => r[j]?.text.length ?? 0)) * 8 + 16)));
            const row = (cells: Tokens.TableCell[], head: boolean, k: string) => (
              <View key={k} style={[styles.tr, { borderColor: th.colors.border, backgroundColor: head ? th.colors.muted : undefined }]}>
                {cells.map((c, j) => (
                  <Text key={j} testID="md-cell" style={[body, styles.td, { width: widths[j], borderColor: th.colors.border, textAlign: tb.align[j] ?? "left", fontFamily: head ? th.font.medium : th.font.regular }]}>
                    <Inline tokens={c.tokens} ctx={ctx} />
                  </Text>
                ))}
              </View>
            );
            return (
              <ScrollView key={i} horizontal style={styles.gap}>
                <View style={{ borderTopWidth: 1, borderLeftWidth: 1, borderColor: th.colors.border }}>
                  {row(tb.header, true, "h")}
                  {tb.rows.map((r, j) => row(r, false, `r${j}`))}
                </View>
              </ScrollView>
            );
          }
          case "hr":
            return <View key={i} style={{ height: 1, backgroundColor: th.colors.border, marginVertical: 8 }} />;
          default:
            return <Text key={i} style={[body, styles.gap]}>{(t as Tokens.Generic).raw}</Text>;
        }
      })}
    </>
  );
}

const MATH = /\$\$([\s\S]+?)\$\$/g;

function MathSplit({ text, ctx }: { text: string; ctx: Ctx }) {
  const out: React.ReactElement[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    if (m.index > last) out.push(<Blocks key={`t${last}`} tokens={marked.lexer(text.slice(last, m.index))} ctx={ctx} />);
    out.push(<MathBlock key={`m${m.index}`} tex={m[1].trim()} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Blocks key={`t${last}`} tokens={marked.lexer(text.slice(last))} ctx={ctx} />);
  return <>{out}</>;
}

/** Assistant Markdown: GFM via marked's lexer, rendered to RN primitives. Block `$$..$$` goes to MathBlock. */
export function Markdown({ text, fontSize = 15 }: { text: string; fontSize?: number }) {
  const th = useTheme();
  const tokens = useMemo(() => marked.lexer(text), [text]);
  return <View><Blocks tokens={tokens} ctx={{ th, base: fontSize }} top /></View>;
}

const styles = StyleSheet.create({
  gap: { marginVertical: 4 },
  quote: { borderLeftWidth: 3, paddingLeft: 10, marginVertical: 4 },
  li: { flexDirection: "row" },
  tr: { flexDirection: "row", borderBottomWidth: 1 },
  td: { paddingHorizontal: 8, paddingVertical: 6, borderRightWidth: 1 },
});

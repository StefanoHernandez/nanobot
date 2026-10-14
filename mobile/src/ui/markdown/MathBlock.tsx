import React, { useMemo } from "react";
import { ScrollView, Text } from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "../ThemeProvider";
import { katexHtml } from "./katex";

// ponytail: fixed height estimate (~48dp per TeX line, min 56). Upgrade path: an onMessage height
// bridge (needs JS enabled in the WebView, which the sandbox deliberately forbids today).
// tall constructs (fractions, big operators, environments) get extra room per line
const heightFor = (tex: string) =>
  Math.max(56, (/\\(frac|dfrac|sum|int|prod|lim|begin|sqrt)/.test(tex) ? 72 : 48) * tex.split("\\\\").length);

export function MathBlock({ tex }: { tex: string }) {
  const th = useTheme();
  const html = useMemo(() => katexHtml(tex, th.colors.foreground), [tex, th.colors.foreground]);
  if (html === null)
    // invalid TeX: raw monospace fallback
    return (
      <ScrollView horizontal style={{ marginVertical: 4, backgroundColor: th.colors.muted, borderRadius: th.radius.sm }}>
        <Text selectable style={{ fontFamily: th.font.mono, color: th.colors.foreground, fontSize: 13, padding: 10 }}>{tex}</Text>
      </ScrollView>
    );
  return (
    <WebView
      originWhitelist={["about:blank"]}
      source={{ html, baseUrl: "about:blank" }}
      javaScriptEnabled={false}
      allowFileAccess={false}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}
      style={{ height: heightFor(tex), backgroundColor: "transparent", marginVertical: 4 }}
    />
  );
}

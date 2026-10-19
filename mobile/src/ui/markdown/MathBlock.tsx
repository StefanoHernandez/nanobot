import React, { useMemo } from "react";
import { Platform, ScrollView, Text } from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "../ThemeProvider";
import { katexHtml } from "./katex";
import { ensureKatexCache } from "./katexCache";
import { heightFor } from "./mathFrame";

export function MathBlock({ tex }: { tex: string }) {
  const th = useTheme();
  const html = useMemo(() => katexHtml(tex, th.colors.foreground), [tex, th.colors.foreground]);
  const baseUrl = useMemo(() => (Platform.OS === "web" ? "about:blank" : ensureKatexCache()), []);

  if (html === null)
    // invalid TeX: raw monospace fallback
    return (
      <ScrollView horizontal style={{ marginVertical: 4, backgroundColor: th.colors.muted, borderRadius: th.radius.sm }}>
        <Text selectable style={{ fontFamily: th.font.mono, color: th.colors.foreground, fontSize: 13, padding: 10 }}>{tex}</Text>
      </ScrollView>
    );
  return (
    <WebView
      testID="webview"
      originWhitelist={Platform.OS === "web" ? ["about:blank"] : ["about:blank", "file://*"]}
      source={{
        html,
        baseUrl,
        allowingReadAccessToURL: Platform.OS === "web" ? undefined : baseUrl,
      }}
      javaScriptEnabled={false}
      allowFileAccess={Platform.OS !== "web"}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r) => r.url === "about:blank" || (baseUrl !== "" && r.url.startsWith(baseUrl))}
      style={{ height: heightFor(tex), backgroundColor: "transparent", marginVertical: 4 }}
    />
  );
}

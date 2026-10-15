import React, { useMemo } from "react";
import { ScrollView, Text } from "react-native";
import { useTheme } from "../ThemeProvider";
import { katexHtml } from "./katex";
import { mathFrameProps } from "./mathFrame";

export function MathBlock({ tex }: { tex: string }) {
  const th = useTheme();
  const html = useMemo(() => katexHtml(tex, th.colors.foreground), [tex, th.colors.foreground]);
  if (html === null) {
    return (
      <ScrollView horizontal style={{ marginVertical: 4, backgroundColor: th.colors.muted, borderRadius: th.radius.sm }}>
        <Text selectable style={{ fontFamily: th.font.mono, color: th.colors.foreground, fontSize: 13, padding: 10 }}>{tex}</Text>
      </ScrollView>
    );
  }
  const frame = mathFrameProps(html, tex);
  return (
    <iframe
      title="math"
      sandbox={frame.sandbox}
      srcDoc={frame.srcDoc}
      referrerPolicy="no-referrer"
      style={{ width: "100%", height: frame.height, border: 0, background: "transparent", margin: "4px 0" }}
    />
  );
}

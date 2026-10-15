import React from "react";
import { WebView, type WebViewProps } from "react-native-webview";
import type { PreviewHandle } from "./previewBridge";

export type { PreviewHandle } from "./previewBridge";

export const PreviewHost = React.forwardRef<PreviewHandle, WebViewProps>(function PreviewHost(props, ref) {
  return (
    <WebView
      {...props}
      ref={(node) => {
        const handle = node as PreviewHandle | null;
        if (typeof ref === "function") ref(handle);
        else if (ref) ref.current = handle;
      }}
    />
  );
});

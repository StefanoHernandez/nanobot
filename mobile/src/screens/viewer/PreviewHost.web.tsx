import React, { useEffect, useImperativeHandle, useRef } from "react";
import { hostCommandFromInject, previewMessageAllowed, previewSandbox, type PreviewHandle } from "./previewBridge";

type PreviewEvent = { nativeEvent: { data: string } };

type Props = {
  source?: { html?: string };
  onMessage?: (event: PreviewEvent) => void;
  style?: object;
};

export const PreviewHost = React.forwardRef<PreviewHandle, Props>(
  function PreviewHost({ source, onMessage }, ref) {
    const frame = useRef<HTMLIFrameElement>(null);
    const onMessageRef = useRef(onMessage);
    onMessageRef.current = onMessage;

    useImperativeHandle(ref, () => ({
      injectJavaScript(script: string) {
        const command = hostCommandFromInject(script);
        const win = frame.current?.contentWindow;
        if (!command || !win) return;
        win.postMessage({ source: "nanobot-host", ...command }, "*");
      },
    }));

    useEffect(() => {
      const onWindowMessage = (event: MessageEvent) => {
        const fromThisFrame = event.source === frame.current?.contentWindow;
        if (!previewMessageAllowed(event.origin, fromThisFrame)) return;
        if (typeof event.data !== "string") return;
        onMessageRef.current?.({ nativeEvent: { data: event.data } });
      };
      window.addEventListener("message", onWindowMessage);
      return () => window.removeEventListener("message", onWindowMessage);
    }, []);

    return (
      <iframe
        ref={frame}
        title="preview"
        sandbox={previewSandbox()}
        srcDoc={source?.html ?? ""}
        referrerPolicy="no-referrer"
        style={{ border: 0, width: "100%", height: "100%", background: "transparent" }}
      />
    );
  },
);

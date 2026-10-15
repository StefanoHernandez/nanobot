import { buildShellHtml } from "../../src/screens/viewer/ArtifactWebView";
import { hostCommandFromInject, previewMessageAllowed, previewSandbox } from "../../src/screens/viewer/previewBridge";

test("the preview sandbox can run scripts but cannot read the page secret", () => {
  expect(previewSandbox()).toBe("allow-scripts");
  expect(previewSandbox()).not.toContain("allow-same-origin");
  expect(previewMessageAllowed("null", true)).toBe(true);
  expect(previewMessageAllowed("https://evil.example", true)).toBe(false);
  expect(previewMessageAllowed("null", false)).toBe(false);
});

test("only the known host commands are forwarded", () => {
  expect(hostCommandFromInject("window.__setHtmlFit&&window.__setHtmlFit(true);true;")).toEqual({
    type: "setHtmlFit",
    fit: true,
  });
  expect(hostCommandFromInject("window.__exportPng&&window.__exportPng();true;")).toEqual({ type: "exportPng" });
  expect(hostCommandFromInject("window.__chunk(4, 'abc+/='); true;")).toEqual({
    type: "chunk",
    offset: 4,
    b64: "abc+/=",
  });
  expect(hostCommandFromInject("window.__chunkError(9); true;")).toEqual({ type: "chunkError", offset: 9 });
  expect(hostCommandFromInject("alert(1)")).toBeNull();
});

test("the preview page posts to the parent frame", () => {
  const html = buildShellHtml({ kind: "html", html: "<p>x</p>" });
  expect(html).toContain("nanobot-host");
  expect(html).toContain("postHost");
  expect(html).toContain('type: "open", url: href');
});

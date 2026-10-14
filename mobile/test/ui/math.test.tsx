import "../../src/i18n";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { MathBlock } from "../../src/ui/markdown/MathBlock";
import { katexHtml } from "../../src/ui/markdown/katex";

test("katexHtml renders KaTeX markup", () => {
  expect(katexHtml("x^2", "#0a0a0a")).toContain('class="katex"');
});

test("invalid TeX returns null", () => {
  expect(katexHtml("\\frac{", "#0a0a0a")).toBeNull();
});

test("MathBlock renders a sandboxed WebView", async () => {
  await render(<ThemeProvider><MathBlock tex="x^2" /></ThemeProvider>);
  const w = screen.getByTestId("webview");
  expect(w.props.javaScriptEnabled).toBe(false);
  expect(w.props.originWhitelist).toEqual(["about:blank"]);
  expect(w.props.onMessage).toBeUndefined();
  expect(w.props.onShouldStartLoadWithRequest({ url: "https://evil" })).toBe(false);
});

test("MathBlock falls back to raw TeX when invalid", async () => {
  await render(<ThemeProvider><MathBlock tex="\frac{" /></ThemeProvider>);
  expect(screen.getByText("\\frac{")).toBeTruthy();
  expect(screen.queryByTestId("webview")).toBeNull();
});

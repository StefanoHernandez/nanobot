import { i18n } from "../../src/i18n";
import React from "react";
import { Linking, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Markdown } from "../../src/ui/markdown/Markdown";
import { CodeBlock } from "../../src/ui/markdown/CodeBlock";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

beforeAll(() => i18n.changeLanguage("it"));
// toast.show() arms a 3s timer on copy; drain it so no handle outlives the suite
beforeEach(() => { jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] }); });
afterEach(async () => {
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});
const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

test("CodeBlock copy button copies the code", async () => {
  await wrap(<CodeBlock code={"print('x')"} lang="python" />);
  await fireEvent.press(screen.getByLabelText("Copia codice"));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith("print('x')");
});

test("Markdown renders GFM table, list and fenced code", async () => {
  await wrap(<Markdown text={"| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two\n\n```js\nconst x = 1;\n```"} />);
  expect(screen.getByText("a")).toBeTruthy();
  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.getByText("two")).toBeTruthy();
  expect(screen.getByLabelText("Copia codice")).toBeTruthy();
});

test("links open only for http/https/mailto", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await wrap(<Markdown text={"[ok](https://a.dev) [bad](javascript:alert(1)) [mail](mailto:a@b.c)"} />);
  await fireEvent.press(screen.getByText("ok"));
  await fireEvent.press(screen.getByText("bad"));
  await fireEvent.press(screen.getByText("mail"));
  expect(open.mock.calls.map((c) => c[0])).toEqual(["https://a.dev", "mailto:a@b.c"]);
});

test("block math falls back to monospace TeX when invalid", async () => {
  await wrap(<Markdown text={"$$\n\\frac{\n$$"} />);
  expect(screen.getByText("\\frac{")).toBeTruthy();
});

test("fenced code containing $$ stays one intact CodeBlock", async () => {
  await wrap(<Markdown text={"```bash\necho $$ and $$\n```"} />);
  expect(screen.getAllByLabelText("Copia codice")).toHaveLength(1);
  expect(screen.getByText(/echo/, { exact: false })).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Copia codice"));
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("echo $$ and $$");
});

test("$$x^2$$ inside a paragraph becomes a math block", async () => {
  await wrap(<Markdown text={"see $$x^2$$ here"} />);
  expect(screen.getByTestId("webview")).toBeTruthy();
  expect(screen.getByText(/see/)).toBeTruthy();
});

test("table cells in the same column share a width", async () => {
  await wrap(<Markdown text={"| a | long header here |\n|---|---|\n| much longer cell text | b |"} />);
  const w = screen.getAllByTestId("md-cell").map((c) => StyleSheet.flatten(c.props.style).width);
  expect(w[0]).toBe(w[2]);
  expect(w[1]).toBe(w[3]);
  expect(w[0]).not.toBe(w[1]);
});

test("30KB code block is rendered without highlighting", async () => {
  const code = "const x = 1;\n".repeat(2500);
  await wrap(<CodeBlock code={code} lang="js" />);
  // plain mode: the whole code is a single string child, no nested keyword spans
  expect(screen.queryByText("const")).toBeNull();
  expect(screen.getByText(/const x = 1;/, { exact: false })).toBeTruthy();
});

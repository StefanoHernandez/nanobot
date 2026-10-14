import "../../src/platform/install";
import React from "react";
import { act, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import { fakeSession, flush } from "../state/fake";

jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return { Markdown: ({ text }: { text: string }) => <Text>{text}</Text> };
});

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => threadStore.setState({ threads: {} }));

test("a history payload the client can't parse (v0.3.5 'messages' shape) shows an error with Retry, not an empty chat", async () => {
  const key = "websocket:c1";
  const f = fakeSession({ [`/api/sessions/${encodeURIComponent(key)}/webui-thread`]: () => ({ schemaVersion: 1, messages: [] }) });
  sessionStore.setState({ session: f.session, state: "open" as never, profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true } });
  await render(<ThemeProvider><ThreadScreen chatKey={key} onBack={() => {}} /></ThemeProvider>);
  await act(flush);
  expect(screen.getByText("Couldn't load this chat's history.")).toBeTruthy();
  expect(screen.getByText("Retry")).toBeTruthy();
});

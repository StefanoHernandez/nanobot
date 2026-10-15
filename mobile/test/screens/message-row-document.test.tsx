import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { MessageRow } from "../../src/screens/thread/MessageRow";
import { artifactStore } from "../../src/screens/viewer/artifactStore";
import { speechStore } from "../../src/extras/speech";
import type { TurnUnit } from "@/lib/activity-timeline";
import type { UIMessage } from "@/lib/types";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}));

jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return { Markdown: ({ text }: { text: string }) => <Text>{text}</Text> };
});

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  artifactStore.clear();
  speechStore.getState().setEnabled(false);
});

const unit = (content: string): TurnUnit => ({
  type: "message",
  message: {
    id: "msg-doc",
    role: "assistant",
    content,
    createdAt: 1,
  } as UIMessage,
  sourceMessageCount: 1,
});

test("short finished answers hide open-document; long answers show it and navigate with name only", async () => {
  const short = "x".repeat(799);
  const shortView = await render(
    <ThemeProvider>
      <MessageRow unit={unit(short)} live={false} />
    </ThemeProvider>
  );
  expect(shortView.queryByLabelText("Open as document")).toBeNull();
  await shortView.unmount();

  const longText = "y".repeat(800);
  const longView = await render(
    <ThemeProvider>
      <MessageRow unit={unit(longText)} live={false} />
    </ThemeProvider>
  );
  const openBtn = longView.getByLabelText("Open as document");
  await act(async () => {
    fireEvent.press(openBtn);
  });
  expect(artifactStore.get()?.content).toBe(longText);
  expect(artifactStore.get()?.name).toBe("answer.md");
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/viewer",
    params: { name: "answer.md" },
  });
  const pushArg = (router.push as jest.Mock).mock.calls[0][0];
  expect(JSON.stringify(pushArg.params)).not.toContain(longText.slice(0, 40));
});

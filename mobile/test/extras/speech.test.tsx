import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Speech from "expo-speech";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { prefs } from "../../src/settings/prefs";
import { kv } from "../../src/platform/storage";
import { AppearanceSection } from "../../src/screens/settings/AppearanceSection";
import { MessageRow } from "../../src/screens/thread/MessageRow";
import { speechStore, stripMarkdownForSpeech } from "../../src/extras/speech";
import type { TurnUnit } from "@/lib/activity-timeline";
import type { UIMessage } from "@/lib/types";

jest.mock("expo-speech", () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

describe("P5-T1: Read-aloud assistant replies with expo-speech", () => {
  beforeEach(() => {
    speechStore.getState().stop();
    jest.clearAllMocks();
    kv.del("pref.voiceAutoRead");
  });

  test("1. stripMarkdownForSpeech removes fenced code blocks, inline backticks, and link URLs", () => {
    const input = "Check [docs](https://example.com) and ```js\nconst x=1;\n```";
    expect(stripMarkdownForSpeech(input)).toBe("Check docs and");

    const input2 = "Here is `const a = 2;` inline and # Heading\nWith **bold** text and <br/> tag.";
    expect(stripMarkdownForSpeech(input2)).toBe("Here is const a = 2; inline and Heading With bold text and tag.");
  });

  test("2. Finished assistant MessageRow renders speech.listen; tapping it calls Speech.speak and switches to speech.stop; tapping again calls Speech.stop", async () => {
    const message: UIMessage = {
      id: "msg-1",
      role: "assistant",
      content: "Hello world! Check [docs](https://nanobot.ai).",
      createdAt: 1000,
    };
    const unit: TurnUnit = {
      type: "message",
      message,
      sourceMessageCount: 1,
    };

    const { getByLabelText, findByLabelText } = await render(
      <ThemeProvider>
        <MessageRow unit={unit} live={false} />
      </ThemeProvider>
    );

    const listenBtn = getByLabelText(/Ascolta|Listen/);
    expect(listenBtn).toBeTruthy();

    // Tap listen
    await act(async () => {
      fireEvent.press(listenBtn);
    });

    expect(Speech.stop).toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledWith(
      "Hello world! Check docs.",
      expect.objectContaining({
        language: expect.stringMatching(/it-IT|en-US/),
      })
    );
    expect(speechStore.getState().speakingId).toBe("msg-1");

    // Button should now be Stop
    const stopBtn = await findByLabelText(/Ferma|Stop/);
    expect(stopBtn).toBeTruthy();

    // Tap stop
    await act(async () => {
      fireEvent.press(stopBtn);
    });

    expect(Speech.stop).toHaveBeenCalledTimes(2);
    expect(speechStore.getState().speakingId).toBeNull();
  });

  test("3. While assistant message is streaming (isStreaming: true or live: true), listen button is NOT rendered", async () => {
    const streamingMessage: UIMessage = {
      id: "msg-streaming",
      role: "assistant",
      content: "Streaming partial content...",
      isStreaming: true,
      createdAt: 1000,
    };
    const unit1: TurnUnit = {
      type: "message",
      message: streamingMessage,
      sourceMessageCount: 1,
    };

    const { queryByLabelText, rerender } = await render(
      <ThemeProvider>
        <MessageRow unit={unit1} live={false} />
      </ThemeProvider>
    );

    expect(queryByLabelText(/Ascolta|Listen/)).toBeNull();
    expect(queryByLabelText(/Ferma|Stop/)).toBeNull();

    // With live: true
    const finishedMessage: UIMessage = {
      id: "msg-live",
      role: "assistant",
      content: "Content with live true",
      isStreaming: false,
      createdAt: 1000,
    };
    const unit2: TurnUnit = {
      type: "message",
      message: finishedMessage,
      sourceMessageCount: 1,
    };

    await rerender(
      <ThemeProvider>
        <MessageRow unit={unit2} live={true} />
      </ThemeProvider>
    );

    expect(queryByLabelText(/Ascolta|Listen/)).toBeNull();
  });

  test("4. AppearanceSection renders settings.voiceAutoRead switch and toggles prefs.voiceAutoRead() in kv", async () => {
    expect(prefs.voiceAutoRead()).toBe(false);

    const { getByLabelText } = await render(
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>
    );

    const toggle = getByLabelText(/Leggi risposte ai messaggi vocali|Read aloud replies to voice messages/);
    expect(toggle).toBeTruthy();

    await act(async () => {
      fireEvent(toggle, "valueChange", true);
    });

    expect(prefs.voiceAutoRead()).toBe(true);
    expect(kv.get("pref.voiceAutoRead")).toBe("1");

    await act(async () => {
      fireEvent(toggle, "valueChange", false);
    });

    expect(prefs.voiceAutoRead()).toBe(false);
    expect(kv.get("pref.voiceAutoRead")).toBe("0");
  });

  test("5. With voiceAutoRead enabled and voicePending true, transitioning from streaming to finished calls Speech.speak automatically", async () => {
    prefs.setVoiceAutoRead(true);
    speechStore.getState().markVoiceDictated();
    expect(speechStore.getState().voicePending).toBe(true);

    const msg: UIMessage = {
      id: "msg-auto",
      role: "assistant",
      content: "Auto read this reply",
      isStreaming: true,
      createdAt: 1000,
    };
    const unit: TurnUnit = {
      type: "message",
      message: msg,
      sourceMessageCount: 1,
    };

    const { rerender } = await render(
      <ThemeProvider>
        <MessageRow unit={unit} live={false} />
      </ThemeProvider>
    );

    expect(Speech.speak).not.toHaveBeenCalled();
    expect(speechStore.getState().voicePending).toBe(true);

    // Transition to finished
    const finishedMsg: UIMessage = {
      ...msg,
      isStreaming: false,
    };
    const finishedUnit: TurnUnit = {
      type: "message",
      message: finishedMsg,
      sourceMessageCount: 1,
    };

    await rerender(
      <ThemeProvider>
        <MessageRow unit={finishedUnit} live={false} />
      </ThemeProvider>
    );

    expect(Speech.speak).toHaveBeenCalledWith(
      "Auto read this reply",
      expect.objectContaining({
        language: expect.stringMatching(/it-IT|en-US/),
      })
    );
    expect(speechStore.getState().voicePending).toBe(false);
  });

  test("6. Profile switch to 'none' stops active speech", () => {
    const { sessionStore } = require("../../src/state/sessionStore");
    sessionStore.setState({ state: "open" });
    speechStore.getState().speak("msg-test", "Some speech text");
    expect(speechStore.getState().speakingId).toBe("msg-test");

    sessionStore.setState({ state: "none", session: null, profile: null });

    expect(Speech.stop).toHaveBeenCalled();
    expect(speechStore.getState().speakingId).toBeNull();
  });
});

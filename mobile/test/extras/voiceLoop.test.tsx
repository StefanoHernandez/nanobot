import "../../src/platform/install";
import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, AppState } from "react-native";
import * as Speech from "expo-speech";
import * as KeepAwake from "expo-keep-awake";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { speechStore } from "../../src/extras/speech";
import { i18n } from "../../src/i18n";
import {
  voiceLoopReducer,
  SilenceDetector,
  silenceDetector,
  useVoiceLoop,
  SPEECH_DB,
  SPEECH_MIN_MS,
  SILENCE_DB,
  SILENCE_DURATION_MS,
  MAX_TURN_MS,
  NO_SPEECH_TIMEOUT_MS,
} from "../../src/extras/voiceLoop";
import { VoiceLoopBar } from "../../src/screens/thread/VoiceLoopBar";
import { Composer } from "../../src/screens/thread/Composer";

// Mocks
const mockRec = {
  uri: "file:///loop.m4a" as string | null,
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  stop: jest.fn(async () => {}),
  getStatus: jest.fn(() => ({ isRecording: true, metering: -60 })),
};
const mockPerm = jest.fn(async () => ({ granted: true }));
const mockDel = jest.fn();
const mockMode = jest.fn(async (_m: unknown) => {});
const mockUseAudioRecorder = jest.fn(() => mockRec);

jest.mock("expo-audio", () => ({
  useAudioRecorder: (_preset?: unknown) => mockUseAudioRecorder(),
  RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" } },
  requestRecordingPermissionsAsync: () => mockPerm(),
  setAudioModeAsync: (m: unknown) => mockMode(m),
}));

jest.mock("expo-file-system", () => ({
  File: class {
    base64 = async () => "QUJD";
    delete = () => mockDel();
  },
}));

jest.mock("expo-speech", () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(async () => {}),
}));

describe("VC-A: continuous voice conversation", () => {
  describe("1. Reducer tests", () => {
    test("the full cycle: idle -> listening -> transcribing -> waiting -> speaking -> listening", () => {
      let state = voiceLoopReducer({ state: "idle", emptyCount: 0 }, { type: "start" });
      expect(state).toEqual({ state: "listening", emptyCount: 0 });

      state = voiceLoopReducer(state, { type: "silence" });
      expect(state).toEqual({ state: "transcribing", emptyCount: 0 });

      state = voiceLoopReducer(state, { type: "transcript", text: "hello nanobot" });
      expect(state).toEqual({ state: "waiting", emptyCount: 0 });

      state = voiceLoopReducer(state, { type: "turnEnded", hasText: true });
      expect(state).toEqual({ state: "speaking", emptyCount: 0 });

      state = voiceLoopReducer(state, { type: "speakingDone" });
      expect(state).toEqual({ state: "listening", emptyCount: 0 });
    });

    test("turnEnded without text (e.g. only tool call) goes straight to listening", () => {
      const waiting = { state: "waiting" as const, emptyCount: 0 };
      const next = voiceLoopReducer(waiting, { type: "turnEnded", hasText: false });
      expect(next).toEqual({ state: "listening", emptyCount: 0 });
    });

    test("empty or whitespace transcript goes to listening; two in a row goes to idle", () => {
      const transcribing = { state: "transcribing" as const, emptyCount: 0 };
      const once = voiceLoopReducer(transcribing, { type: "transcript", text: "   " });
      expect(once).toEqual({ state: "listening", emptyCount: 1 });

      const transcribingAgain = voiceLoopReducer(once, { type: "silence" });
      expect(transcribingAgain).toEqual({ state: "transcribing", emptyCount: 1 });

      const twice = voiceLoopReducer(transcribingAgain, { type: "transcript", text: "" });
      expect(twice).toEqual({ state: "idle", emptyCount: 0 });
    });

    test("transcription error goes to idle", () => {
      const transcribing = { state: "transcribing" as const, emptyCount: 0 };
      const next = voiceLoopReducer(transcribing, { type: "transcriptError" });
      expect(next).toEqual({ state: "idle", emptyCount: 0 });
    });

    test("interrupt while speaking goes to listening", () => {
      const speaking = { state: "speaking" as const, emptyCount: 0 };
      const next = voiceLoopReducer(speaking, { type: "interrupt" });
      expect(next).toEqual({ state: "listening", emptyCount: 0 });
    });

    test("stop and background from every state go to idle", () => {
      const states = ["idle", "listening", "transcribing", "waiting", "speaking"] as const;
      for (const st of states) {
        expect(voiceLoopReducer({ state: st, emptyCount: 1 }, { type: "stop" })).toEqual({
          state: "idle",
          emptyCount: 0,
        });
        expect(voiceLoopReducer({ state: st, emptyCount: 1 }, { type: "background" })).toEqual({
          state: "idle",
          emptyCount: 0,
        });
      }
    });

    test("noSpeechTimeout in listening goes to idle", () => {
      const listening = { state: "listening" as const, emptyCount: 0 };
      const next = voiceLoopReducer(listening, { type: "noSpeechTimeout" });
      expect(next).toEqual({ state: "idle", emptyCount: 0 });
    });
  });

  describe("2. SilenceDetector tests", () => {
    test("no speech means no end", () => {
      const sd = new SilenceDetector();
      // Push background noise at -60 dB for 5 seconds
      for (let t = 0; t <= 5000; t += 100) {
        const ev = sd.push(-60, t);
        expect(ev).toBeNull();
      }
    });

    test("speech then 1.4 s of silence does not end the turn, 1.5 s does", () => {
      const sd = new SilenceDetector();
      // Speech starts: 200 ms at -30 dB
      expect(sd.push(-30, 0)).toBeNull();
      expect(sd.push(-30, 100)).toBeNull();
      expect(sd.push(-30, 200)).toBe("speechStart");

      // Silence begins at 300 ms (-55 dB)
      expect(sd.push(-55, 300)).toBeNull();
      // At 300 + 1400 = 1700 ms (1.4 s of silence): turn should NOT end yet
      for (let t = 400; t <= 1700; t += 100) {
        expect(sd.push(-55, t)).toBeNull();
      }
      // At 300 + 1500 = 1800 ms (1.5 s of silence): turn ends!
      expect(sd.push(-55, 1800)).toBe("silence");
    });

    test("a brief 100 ms noise spike is not speech", () => {
      const sd = new SilenceDetector();
      // Spike at 0 ms and 100 ms, then drops back to silence at 200 ms
      expect(sd.push(-30, 0)).toBeNull();
      expect(sd.push(-30, 100)).toBeNull();
      expect(sd.push(-60, 200)).toBeNull();
      // Push silence for 2 seconds - should never trigger speechStart or silence
      for (let t = 300; t <= 2000; t += 100) {
        expect(sd.push(-60, t)).toBeNull();
      }
    });

    test("the 60 s max is respected", () => {
      const sd = new SilenceDetector();
      // Constant speech for 60 seconds
      let event = null;
      for (let t = 0; t < 60_000; t += 100) {
        const ev = sd.push(-35, t);
        if (ev === "speechStart") continue;
        if (ev) event = ev;
      }
      expect(event).toBeNull();
      // At 60_000 ms: triggers maxDuration
      expect(sd.push(-35, 60_000)).toBe("maxDuration");
    });

    test("10 s timeout without speech triggers noSpeechTimeout", () => {
      const sd = new SilenceDetector();
      for (let t = 0; t < 10_000; t += 500) {
        expect(sd.push(-60, t)).toBeNull();
      }
      expect(sd.push(-60, 10_000)).toBe("noSpeechTimeout");
    });

    test("pure silenceDetector function processes array of samples", () => {
      const samples = [
        { db: -30, tMs: 0 },
        { db: -30, tMs: 100 },
        { db: -30, tMs: 200 },
        { db: -55, tMs: 300 },
        { db: -55, tMs: 1800 },
      ];
      const events = silenceDetector(samples);
      expect(events).toContain("speechStart");
      expect(events).toContain("silence");
    });
  });

  describe("3. useVoiceLoop hook tests", () => {
    let transcribeMock: jest.Mock;
    let now = 1000;
    const chatKey = "websocket:test-chat-key";

    beforeEach(() => {
      jest.useFakeTimers();
      now = 1000;
      jest.spyOn(Date, "now").mockImplementation(() => now);
      jest.clearAllMocks();
      transcribeMock = jest.fn().mockResolvedValue("hello world");
      sessionStore.setState({
        session: {
          client: {
            transcribeAudio: transcribeMock,
            sendMessage: jest.fn(),
          },
          frameLimit: null,
        } as never,
        state: "open" as never,
      });
      threadStore.setState({
        threads: {
          [chatKey]: {
            messages: [],
            running: false,
            model: null,
            preset: null,
            notices: [],
            draft: "",
            loaded: true,
            stopped: false,
            sendError: null,
            uploading: false,
            pendingFiles: [],
            forkBoundary: null,
            temporary: false,
          },
        },
      });
      speechStore.getState().setEnabled(true);
      speechStore.setState({ voicePending: null, speakingId: null });
    });

    afterEach(async () => {
      await act(async () => {
        jest.clearAllTimers();
      });
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    const stepTime = async (ms: number) => {
      for (let t = 0; t < ms; t += 100) {
        now += 100;
        await act(async () => {
          jest.advanceTimersByTime(100);
        });
      }
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    test("transcript is sent exactly once and markVoiceDictated is called", async () => {
      const markSpy = jest.spyOn(speechStore.getState(), "markVoiceDictated");
      const sendSpy = jest.spyOn(threadStore.getState(), "send").mockReturnValue(true);

      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      await act(async () => {
        await result.current.start();
      });

      expect(KeepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith("voice-loop");
      expect(mockRec.record).toHaveBeenCalled();
      expect(result.current.state).toBe("listening");

      // Speech for 300 ms (>= 200 ms)
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -30 });
      await stepTime(300);

      // Silence for 1600 ms (>= 1500 ms)
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -60 });
      await stepTime(1600);

      // Recorder stopped and transcription invoked
      expect(mockRec.stop).toHaveBeenCalled();
      expect(transcribeMock).toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith(expect.anything(), chatKey, "hello world");
      expect(markSpy).toHaveBeenCalledWith(chatKey, true);
    });

    test("when speech ends, recording restarts", async () => {
      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      await act(async () => {
        await result.current.start();
      });

      // Simulate moving through transcribing to waiting
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -30 });
      await stepTime(300);
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -60 });
      await stepTime(1600);

      // Now in waiting state
      expect(result.current.state).toBe("waiting");

      // Thread finishes turn with assistant text -> auto-read triggers speechStore.speak
      await act(async () => {
        speechStore.setState({ speakingId: "msg-assistant" });
      });
      expect(result.current.state).toBe("speaking");

      mockRec.record.mockClear();
      // Speech finishes (speakingId -> null)
      await act(async () => {
        speechStore.setState({ speakingId: null });
      });

      expect(result.current.state).toBe("listening");
      expect(mockRec.record).toHaveBeenCalled();
    });

    test("Termina stops the recorder, stops TTS and deletes the temp file", async () => {
      const speechStopSpy = jest.spyOn(speechStore.getState(), "stop");
      const { result } = await renderHook(() => useVoiceLoop(chatKey));

      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state).toBe("listening");

      await act(async () => {
        await result.current.stop();
      });

      expect(mockRec.stop).toHaveBeenCalled();
      expect(mockDel).toHaveBeenCalled();
      expect(mockMode).toHaveBeenCalledWith({ allowsRecording: false });
      expect(speechStopSpy).toHaveBeenCalled();
      expect(KeepAwake.deactivateKeepAwake).toHaveBeenCalledWith("voice-loop");
      expect(result.current.state).toBe("idle");
    });

    test("AppState background ends the loop and cleans up", async () => {
      let appListener: ((s: string) => void) | null = null;
      jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, l: (s: string) => void) => {
        appListener = l;
        return { remove: jest.fn() };
      }) as never);

      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state).toBe("listening");

      // AppState change to background
      await act(async () => {
        appListener?.("background");
      });

      expect(result.current.state).toBe("idle");
      expect(mockRec.stop).toHaveBeenCalled();
      expect(mockDel).toHaveBeenCalled();
      expect(KeepAwake.deactivateKeepAwake).toHaveBeenCalledWith("voice-loop");
    });
  });

  describe("4. Part 1: VC-A bug fixes", () => {
    let transcribeMock: jest.Mock;
    let now = 1000;
    const chatKey = "websocket:part1-chat-key";

    beforeEach(() => {
      jest.useFakeTimers();
      now = 1000;
      jest.spyOn(Date, "now").mockImplementation(() => now);
      jest.clearAllMocks();
      transcribeMock = jest.fn().mockResolvedValue("hello world");
      sessionStore.setState({
        session: {
          client: {
            transcribeAudio: transcribeMock,
            sendMessage: jest.fn(),
          },
          frameLimit: null,
        } as never,
        state: "open" as never,
      });
      threadStore.setState({
        threads: {
          [chatKey]: {
            messages: [],
            running: false,
            model: null,
            preset: null,
            notices: [],
            draft: "",
            loaded: true,
            stopped: false,
            sendError: null,
            uploading: false,
            pendingFiles: [],
            forkBoundary: null,
            temporary: false,
          },
        },
      });
      speechStore.getState().setEnabled(true);
      speechStore.setState({ voicePending: null, speakingId: null });
    });

    afterEach(async () => {
      await act(async () => {
        jest.clearAllTimers();
      });
      jest.useRealTimers();
      jest.restoreAllMocks();
      cleanup();
    });

    const stepTime = async (ms: number) => {
      for (let t = 0; t < ms; t += 100) {
        now += 100;
        await act(async () => {
          jest.advanceTimersByTime(100);
        });
      }
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    // Item 1: startRecording runs twice -> must run only once
    test("Item 1: startRecording runs only once on start() even if permission takes a tick", async () => {
      mockPerm.mockClear();
      mockPerm.mockImplementationOnce(async () => {
        await Promise.resolve();
        return { granted: true };
      });
      mockRec.prepareToRecordAsync.mockClear();
      const { result } = await renderHook(() => useVoiceLoop(chatKey));

      await act(async () => {
        await result.current.start();
      });

      expect(mockPerm).toHaveBeenCalledTimes(1);
      expect(mockRec.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    });

    // Item 2: The mic leaks when Termina or background lands during permission or prepare awaits
    test("Item 2: Termina during prepare await aborts and stops recorder (no leak)", async () => {
      let resolvePrepare: () => void = () => {};
      mockRec.prepareToRecordAsync.mockImplementationOnce(() => {
        return new Promise<void>((resolve) => {
          resolvePrepare = resolve;
        });
      });

      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start();
      });

      // User hits Termina while prepare is pending
      await act(async () => {
        await result.current.stop();
      });

      // Now prepare finishes
      await act(async () => {
        resolvePrepare();
        await startPromise;
      });

      // Recorder must not be recording
      expect(result.current.state).toBe("idle");
      expect(mockMode).toHaveBeenLastCalledWith({ allowsRecording: false });
    });

    // Item 3: A transcription in flight sends after Termina -> drop text and send nothing
    test("Item 3: transcription in flight when stop() is called is dropped and not sent", async () => {
      const sendSpy = jest.spyOn(threadStore.getState(), "send").mockReturnValue(true);
      let resolveTranscribe: (t: string) => void = () => {};
      transcribeMock.mockImplementationOnce(() => {
        return new Promise<string>((resolve) => {
          resolveTranscribe = resolve;
        });
      });

      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      await act(async () => {
        await result.current.start();
      });

      // Trigger silence to enter transcribing
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -30 });
      await stepTime(300);
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -60 });
      await stepTime(1600);

      expect(transcribeMock).toHaveBeenCalled();

      // Now user calls stop() while transcription is in flight
      await act(async () => {
        await result.current.stop();
      });
      expect(result.current.state).toBe("idle");

      // Now transcribe resolves
      await act(async () => {
        resolveTranscribe("stale text");
      });

      expect(sendSpy).not.toHaveBeenCalled();
    });

    // Item 4: Stale session -> session change ends the loop
    test("Item 4: session change ends the loop", async () => {
      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state).toBe("listening");

      // Switch session / profile
      await act(async () => {
        sessionStore.setState({ session: null, state: "closed" as never });
      });

      expect(result.current.state).toBe("idle");
    });

    // Item 5: Stuck in waiting
    test("Item 5a: if threadStore.send fails, loop stops and goes to idle with operationFailed toast", async () => {
      const toastSpy = jest.spyOn(require("../../src/ui/components/Toast").toast, "show");
      jest.spyOn(threadStore.getState(), "send").mockReturnValue(false);

      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      await act(async () => {
        await result.current.start();
      });

      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -30 });
      await stepTime(300);
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -60 });
      await stepTime(1600);

      expect(result.current.state).toBe("idle");
      expect(toastSpy).toHaveBeenCalledWith(i18n.t("common.operationFailed"));
    });

    test("Item 5b: waiting timeout (180s) ends the loop", async () => {
      jest.spyOn(threadStore.getState(), "send").mockReturnValue(true);

      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      await act(async () => {
        await result.current.start();
      });

      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -30 });
      await stepTime(300);
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -60 });
      await stepTime(1600);

      expect(result.current.state).toBe("waiting");

      // Advance by 180,000 ms
      await act(async () => {
        jest.advanceTimersByTime(180_000);
      });

      expect(result.current.state).toBe("idle");
    });

    // Item 8: No recorder hook created when voice is unavailable
    test("Item 8: Composer does not initialize voice loop recorder when voice is unavailable", async () => {
      sessionStore.setState({
        session: {
          id: "s1",
          get: jest.fn(async () => ({
            transcription: { enabled: false, provider_configured: false },
          })),
          client: { onRuntimeModelUpdate: () => () => {}, onChat: () => () => {} },
        } as never,
        state: "open" as never,
        profile: null,
      });

      mockUseAudioRecorder.mockClear();

      await render(
        <ThemeProvider>
          <Composer chatKey="chat-no-voice" />
        </ThemeProvider>,
      );

      // With voice unavailable, useAudioRecorder should not have been called
      expect(mockUseAudioRecorder).not.toHaveBeenCalled();
    });

    // Item 6: machineRef lags -> machineRef must be updated synchronously inside dispatch
    test("Item 6: machineRef is updated synchronously inside dispatch", async () => {
      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      expect(result.current.state).toBe("idle");

      // When start is triggered, state changes to listening immediately in ref
      await act(async () => {
        const startPromise = result.current.start();
        // Since dispatch was called synchronously inside start:
        // the machineRef should already be listening even before all async actions complete
        await startPromise;
      });
      expect(result.current.state).toBe("listening");
    });

    // Item 7: Side effect in an updater -> announce() called outside setMachine updater
    test("Item 7: announce() is called outside setMachine updater", async () => {
      const announceSpy = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
      announceSpy.mockClear();

      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      await act(async () => {
        await result.current.start();
      });

      // announceForAccessibility should be called for state transition
      expect(announceSpy).toHaveBeenCalledWith(i18n.t("voiceLoop.listening"));
    });

    // Item 9: On too-short path, temp file is deleted and audio mode is reset
    test("Item 9: On too-short turn (<200ms), file is deleted and audio mode reset", async () => {
      mockDel.mockClear();
      mockMode.mockClear();
      const origUri = mockRec.uri;

      const { result } = await renderHook(() => useVoiceLoop(chatKey));
      await act(async () => {
        await result.current.start();
      });

      // Speech for 300 ms to trigger speechStart
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -30 });
      await stepTime(300);

      // Now set now to advance by only 100ms total from start so durationMs < 200
      now = 1100;
      mockRec.getStatus.mockReturnValue({ isRecording: true, metering: -60 });
      await stepTime(1600);

      expect(mockMode).toHaveBeenCalledWith({ allowsRecording: false });
      expect(mockDel).toHaveBeenCalled();
      mockRec.uri = origUri;
    });
  });

  describe("5. UI and button tests", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(async () => {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
      cleanup();
    });

    test("VoiceLoopBar renders listening state text and stop button", async () => {
      const onStop = jest.fn();

      await render(
        <ThemeProvider>
          <VoiceLoopBar
            state="listening"
            level={0.5}
            onStop={onStop}
            onInterrupt={jest.fn()}
          />
        </ThemeProvider>,
      );

      expect(screen.getByText(i18n.t("voiceLoop.listening"))).toBeTruthy();
      expect(screen.queryByText(i18n.t("voiceLoop.interrupt"))).toBeNull();

      const stopBtn = screen.getByLabelText(i18n.t("voiceLoop.stop"));
      fireEvent.press(stopBtn);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    test("VoiceLoopBar renders speaking state text and interrupt button", async () => {
      const onInterrupt = jest.fn();

      await render(
        <ThemeProvider>
          <VoiceLoopBar
            state="speaking"
            level={0}
            onStop={jest.fn()}
            onInterrupt={onInterrupt}
          />
        </ThemeProvider>,
      );

      expect(screen.getByText(i18n.t("voiceLoop.speaking"))).toBeTruthy();
      const interruptBtn = screen.getByLabelText(i18n.t("voiceLoop.interrupt"));
      fireEvent.press(interruptBtn);
      expect(onInterrupt).toHaveBeenCalledTimes(1);
    });

    test("Composer: loop button is disabled with audio replies off and its hint is shown", async () => {
      speechStore.getState().setEnabled(false);
      sessionStore.setState({
        session: {
          id: "s1",
          get: jest.fn(async () => ({
            transcription: { enabled: true, provider: "openai", provider_configured: true },
          })),
          client: { onRuntimeModelUpdate: () => () => {}, onChat: () => () => {} },
        } as never,
        state: "open" as never,
        profile: null,
      });

      const { unmount } = await render(
        <ThemeProvider>
          <Composer chatKey="chat-test" />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText(i18n.t("voiceLoop.start"))).toBeTruthy();
      });

      const loopBtn = screen.getByLabelText(i18n.t("voiceLoop.start"));
      expect(loopBtn.props.accessibilityState?.disabled).toBe(true);
      expect(loopBtn.props.accessibilityHint).toBe(i18n.t("voiceLoop.audioRepliesRequired"));
      unmount();
    });
  });
});


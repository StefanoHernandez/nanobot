import "../../src/platform/install";
import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { prefs } from "../../src/settings/prefs";
import { i18n } from "../../src/i18n";
import { toast } from "../../src/ui/components/Toast";
import { Composer } from "../../src/screens/thread/Composer";
import { VoiceLoopBar } from "../../src/screens/thread/VoiceLoopBar";
import { useVoiceLoop } from "../../src/extras/voiceLoop";
import { DeviceSttEngine } from "../../src/extras/sttEngine";
import { AppearanceSection } from "../../src/screens/settings/AppearanceSection";

// Mock listeners for expo-speech-recognition
let mockSpeechListeners: Record<string, ((ev: any) => void)[]> = {};
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockAbort = jest.fn();
let mockIsRecognitionAvailable = true;
let mockInstalledLocales = ["it-IT", "en-US"];

jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => mockIsRecognitionAvailable,
    getSupportedLocales: jest.fn(async () => ({
      installedLocales: mockInstalledLocales,
      locales: ["it-IT", "en-US"],
    })),
    addListener: jest.fn((event: string, listener: (ev: any) => void) => {
      if (!mockSpeechListeners[event]) mockSpeechListeners[event] = [];
      mockSpeechListeners[event].push(listener);
      return {
        remove: jest.fn(() => {
          mockSpeechListeners[event] = mockSpeechListeners[event]?.filter((l) => l !== listener);
        }),
      };
    }),
    start: (opts: any) => mockStart(opts),
    stop: () => {
      mockStop();
      mockEmitSpeechEvent("end");
    },
    abort: () => mockAbort(),
  },
}));

// Mock expo-audio
const mockRec = {
  uri: "file:///loop.m4a" as string | null,
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  stop: jest.fn(async () => {}),
  getStatus: jest.fn(() => ({ isRecording: true, metering: -60 })),
};
const mockPerm = jest.fn(async () => ({ granted: true }));
const mockUseAudioRecorder = jest.fn(() => mockRec);

jest.mock("expo-audio", () => ({
  useAudioRecorder: () => mockUseAudioRecorder(),
  RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" } },
  requestRecordingPermissionsAsync: () => mockPerm(),
  setAudioModeAsync: jest.fn(async () => {}),
}));

jest.mock("expo-file-system", () => ({
  File: class {
    base64 = async () => "QUJD";
    delete = jest.fn();
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

function mockEmitSpeechEvent(event: string, payload?: any) {
  const list = mockSpeechListeners[event] ?? [];
  for (const fn of [...list]) {
    fn(payload);
  }
}

describe("VC-B Part 2: On-device speech recognition & UI integration", () => {
  const originalOS = Platform.OS;

  beforeAll(async () => {
    await i18n.changeLanguage("it");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cleanup();
    mockSpeechListeners = {};
    mockIsRecognitionAvailable = true;
    mockInstalledLocales = ["it-IT", "en-US"];
    (Platform as any).OS = "android";
    prefs.setVoiceEngine("device");

    sessionStore.setState({
      session: {
        id: "s1",
        limits: { max_file_bytes: 10_000_000, max_files: 5, total_file_bytes: 20_000_000 },
        client: {
          transcribeAudio: jest.fn(async () => "testo dal server"),
          onRuntimeModelUpdate: () => () => {},
          onChat: () => () => {},
        },
        get: jest.fn(async (url: string) => {
          if (url === "/api/settings") {
            return {
              transcription: { enabled: true, provider_configured: true, provider: "groq" },
            };
          }
          return {};
        }),
      } as never,
      state: "open" as never,
    });
  });

  afterEach(() => {
    cleanup();
    (Platform as any).OS = originalOS;
  });

  // 1. Partial events update UI text in VoiceLoopBar
  test("VoiceLoopBar shows partial text while listening", async () => {
    const { getByText, rerender } = await render(
      <ThemeProvider>
        <VoiceLoopBar state="listening" level={0.5} onStop={() => {}} onInterrupt={() => {}} />
      </ThemeProvider>,
    );
    expect(getByText(i18n.t("voiceLoop.listening"))).toBeTruthy();

    await rerender(
      <ThemeProvider>
        <VoiceLoopBar state="listening" level={0.5} partialText="ciao come stai" onStop={() => {}} onInterrupt={() => {}} />
      </ThemeProvider>,
    );
    expect(getByText("ciao come stai")).toBeTruthy();
  });

  // 2. Partial events in dictation update composer text live, and final text goes into draft
  test("Dictation with device engine shows partial text live and final text in draft", async () => {
    const { getByLabelText, getByPlaceholderText } = await render(
      <ThemeProvider>
        <Composer chatKey="c1" />
      </ThemeProvider>,
    );
    await act(async () => {});

    const micBtn = getByLabelText(i18n.t("voice.start"));
    expect(micBtn).toBeTruthy();

    // Start dictation
    await act(async () => {
      fireEvent.press(micBtn);
    });

    // Emitting partial text
    await act(async () => {
      mockEmitSpeechEvent("result", { results: [{ transcript: "ciao mondo" }], isFinal: false });
    });

    // Input should display the partial text
    const input = getByPlaceholderText(i18n.t("composer.placeholder"));
    expect(input.props.value).toBe("ciao mondo");

    // Press stop
    const stopBtn = getByLabelText(i18n.t("voice.stop"));
    await act(async () => {
      mockEmitSpeechEvent("result", { results: [{ transcript: "ciao mondo definitivo" }], isFinal: true });
      fireEvent.press(stopBtn);
    });

    // Final text goes into draft
    expect(input.props.value).toBe("ciao mondo definitivo");
  });

  // 3. Final sends in the loop
  test("Voice loop with device engine sends final text directly via threadStore.send", async () => {
    const sendSpy = jest.spyOn(threadStore.getState(), "send").mockReturnValue(true);

    const { result } = await renderHook(() => useVoiceLoop("c1"));
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("listening");

    // Partial updates partialText
    await act(async () => {
      mockEmitSpeechEvent("result", { results: [{ transcript: "dimmi una poesia" }], isFinal: false });
    });
    expect(result.current.partialText).toBe("dimmi una poesia");

    // Final result and end event
    await act(async () => {
      mockEmitSpeechEvent("result", { results: [{ transcript: "dimmi una poesia" }], isFinal: true });
      mockEmitSpeechEvent("end");
    });

    expect(sendSpy).toHaveBeenCalledWith(expect.anything(), "c1", "dimmi una poesia");
    expect(result.current.state).toBe("waiting");
  });

  // 4. Errors map to toasts and fall back to the server engine
  test("language-not-supported toast and fallback to server engine in dictation", async () => {
    const toastSpy = jest.spyOn(toast, "show");

    const { getByLabelText } = await render(
      <ThemeProvider>
        <Composer chatKey="c1" />
      </ThemeProvider>,
    );
    await act(async () => {});

    const micBtn = getByLabelText(i18n.t("voice.start"));
    await act(async () => {
      fireEvent.press(micBtn);
    });

    // Emit language-not-supported error
    await act(async () => {
      mockEmitSpeechEvent("error", { error: "language-not-supported" });
    });

    expect(toastSpy).toHaveBeenCalledWith(i18n.t("voice.error.language-not-supported"));
    // Audio recorder should have been started as fallback
    expect(mockRec.prepareToRecordAsync).toHaveBeenCalled();
  });

  // 5. With pref server, old path is used unchanged
  test("With pref server, device recognizer is not used and audio recorder is called", async () => {
    prefs.setVoiceEngine("server");

    const { getByLabelText } = await render(
      <ThemeProvider>
        <Composer chatKey="c1" />
      </ThemeProvider>,
    );
    await act(async () => {});

    const micBtn = getByLabelText(i18n.t("voice.start"));
    await act(async () => {
      fireEvent.press(micBtn);
    });

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockRec.prepareToRecordAsync).toHaveBeenCalled();
  });

  // 6. Mic shows with device engine even when server transcription is off
  test("Mic button shows when server transcription is off but recognition is available", async () => {
    sessionStore.setState({
      session: {
        id: "s1",
        get: jest.fn(async () => ({
          transcription: { enabled: false, provider_configured: false },
        })),
        client: { onRuntimeModelUpdate: () => () => {}, onChat: () => () => {} },
      } as never,
      state: "open" as never,
    });

    const { queryByLabelText } = await render(
      <ThemeProvider>
        <Composer chatKey="c1" />
      </ThemeProvider>,
    );
    await act(async () => {});

    expect(queryByLabelText(i18n.t("voice.start"))).toBeTruthy();
  });

  // 7. On web nothing changes: voice UI stays hidden
  test("Voice UI stays hidden on web even if recognition or server is available", async () => {
    (Platform as any).OS = "web";

    const { queryByLabelText } = await render(
      <ThemeProvider>
        <Composer chatKey="c1" />
      </ThemeProvider>,
    );
    await act(async () => {});

    expect(queryByLabelText(i18n.t("voice.start"))).toBeNull();
    expect(queryByLabelText(i18n.t("voiceLoop.start"))).toBeNull();
  });

  // 8. Settings AppearanceSection voice engine toggle and offline hints
  test("AppearanceSection shows voice engine toggle, offline hint, and offline status", async () => {
    const { getByText } = await render(
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>,
    );
    await act(async () => {});

    expect(getByText(i18n.t("settings.voiceEngine"))).toBeTruthy();
    expect(getByText(i18n.t("voice.engineDevice"))).toBeTruthy();
    expect(getByText(i18n.t("voice.engineServer"))).toBeTruthy();
    expect(getByText(i18n.t("voice.offlineHint"))).toBeTruthy();
    expect(getByText(i18n.t("voice.offlineReady"))).toBeTruthy();

    const serverBtn = getByText(i18n.t("voice.engineServer"));
    await act(async () => {
      fireEvent.press(serverBtn);
    });
    expect(prefs.voiceEngine()).toBe("server");
  });
});

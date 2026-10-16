import { DeviceSttEngine, DEVICE_SILENCE_MS, getSttEngine, isVoiceAvailable } from "../../src/extras/sttEngine";
import { prefs } from "../../src/settings/prefs";
import { toast } from "../../src/ui/components/Toast";
import { i18n } from "../../src/i18n";
import { Platform } from "react-native";

// Mock expo-speech-recognition
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockAbort = jest.fn();
const mockIsRecognitionAvailable = jest.fn(() => true);
const mockRequestPermissions = jest.fn(async () => ({ granted: true }));
const mockGetSupportedLocales = jest.fn(async (_opts?: any) => ({
  locales: ["it-IT", "en-US"],
  installedLocales: ["it-IT"],
}));

const listeners: Record<string, ((event: any) => void)[]> = {};

jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    start: (opts: any) => mockStart(opts),
    stop: () => mockStop(),
    abort: () => mockAbort(),
    isRecognitionAvailable: () => mockIsRecognitionAvailable(),
    requestPermissionsAsync: () => mockRequestPermissions(),
    getSupportedLocales: (opts: any) => mockGetSupportedLocales(opts),
    addListener: (eventName: string, listener: (event: any) => void) => {
      if (!listeners[eventName]) listeners[eventName] = [];
      listeners[eventName].push(listener);
      return {
        remove: () => {
          listeners[eventName] = (listeners[eventName] || []).filter((l) => l !== listener);
        },
      };
    },
  },
}));

function emitNativeEvent(eventName: string, data: any) {
  const cbs = listeners[eventName] || [];
  for (const cb of cbs) {
    cb(data);
  }
}

describe("sttEngine: Speech-to-text engines", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    prefs.setVoiceEngine("device");
    mockIsRecognitionAvailable.mockReturnValue(true);
    mockGetSupportedLocales.mockResolvedValue({
      locales: ["it-IT", "en-US"],
      installedLocales: ["it-IT"],
    });
  });

  describe("DeviceSttEngine", () => {
    test("starts recognition with correct options when locale is installed for offline", async () => {
      await i18n.changeLanguage("it");
      const engine = new DeviceSttEngine();
      await engine.start();

      expect(mockStart).toHaveBeenCalledWith({
        lang: "it-IT",
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: true,
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: DEVICE_SILENCE_MS,
        },
      });
    });

    test("sets requiresOnDeviceRecognition to false when locale is not installed", async () => {
      await i18n.changeLanguage("en");
      mockGetSupportedLocales.mockResolvedValueOnce({
        locales: ["it-IT", "en-US"],
        installedLocales: ["it-IT"], // en-US not installed
      });

      const engine = new DeviceSttEngine();
      await engine.start();

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({
          lang: "en-US",
          requiresOnDeviceRecognition: false,
        }),
      );
    });

    test("dispatches partial and final events from native result events", async () => {
      const engine = new DeviceSttEngine();
      const partialCb = jest.fn();
      const finalCb = jest.fn();
      const endCb = jest.fn();

      engine.on("partial", partialCb);
      engine.on("final", finalCb);
      engine.on("end", endCb);

      await engine.start();

      // Emit partial native result
      emitNativeEvent("result", {
        isFinal: false,
        results: [{ transcript: "ciao", confidence: 0.9 }],
      });
      expect(partialCb).toHaveBeenCalledWith("ciao");
      expect(finalCb).not.toHaveBeenCalled();

      // Emit final native result
      emitNativeEvent("result", {
        isFinal: true,
        results: [{ transcript: "ciao mondo", confidence: 1.0 }],
      });
      expect(finalCb).toHaveBeenCalledWith("ciao mondo");

      // Emit end
      emitNativeEvent("end", null);
      expect(endCb).toHaveBeenCalled();
    });

    test("stop() resolves with final text", async () => {
      const engine = new DeviceSttEngine();
      await engine.start();

      const stopPromise = engine.stop();
      expect(mockStop).toHaveBeenCalled();

      emitNativeEvent("result", {
        isFinal: true,
        results: [{ transcript: "test stop text", confidence: 1.0 }],
      });
      emitNativeEvent("end", null);

      const result = await stopPromise;
      expect(result).toBe("test stop text");
    });

    test("cancel() calls abort and does not return final text", async () => {
      const engine = new DeviceSttEngine();
      await engine.start();

      await engine.cancel();
      expect(mockAbort).toHaveBeenCalled();
    });

    test("dispatches error event", async () => {
      const engine = new DeviceSttEngine();
      const errorCb = jest.fn();
      engine.on("error", errorCb);
      await engine.start();

      emitNativeEvent("error", { error: "language-not-supported", message: "Lang unsupported" });
      expect(errorCb).toHaveBeenCalledWith("language-not-supported");
    });
  });

  describe("Engine selection and fallbacks", () => {
    test("returns device engine by default when available", async () => {
      prefs.setVoiceEngine("device");
      mockIsRecognitionAvailable.mockReturnValue(true);

      const engine = getSttEngine();
      expect(engine.name).toBe("device");
    });

    test("falls back to server engine and shows engineUnavailable toast once when recognition unavailable", async () => {
      const toastSpy = jest.spyOn(toast, "show");
      prefs.setVoiceEngine("device");
      mockIsRecognitionAvailable.mockReturnValue(false);

      const engine1 = getSttEngine();
      expect(engine1.name).toBe("server");
      expect(toastSpy).toHaveBeenCalledWith(i18n.t("voice.engineUnavailable"));

      // Second call does not toast again
      toastSpy.mockClear();
      const engine2 = getSttEngine();
      expect(engine2.name).toBe("server");
      expect(toastSpy).not.toHaveBeenCalled();
    });

    test("returns server engine when pref is server", async () => {
      prefs.setVoiceEngine("server");
      mockIsRecognitionAvailable.mockReturnValue(true);

      const engine = getSttEngine();
      expect(engine.name).toBe("server");
    });
  });

  describe("Mic visibility", () => {
    test("mic is visible if recognition is available even if server transcription is off", () => {
      mockIsRecognitionAvailable.mockReturnValue(true);
      const serverSettings = {
        transcription: { enabled: false, provider_configured: false },
      };
      expect(isVoiceAvailable(serverSettings as any)).toBe(true);
    });

    test("mic is visible if server transcription is on even if recognition is unavailable", () => {
      mockIsRecognitionAvailable.mockReturnValue(false);
      const serverSettings = {
        transcription: { enabled: true, provider_configured: true, provider: "openai" },
      };
      expect(isVoiceAvailable(serverSettings as any)).toBe(true);
    });

    test("mic is hidden on web", () => {
      const origOs = Platform.OS;
      try {
        (Platform as any).OS = "web";
        mockIsRecognitionAvailable.mockReturnValue(true);
        const serverSettings = {
          transcription: { enabled: true, provider_configured: true, provider: "openai" },
        };
        expect(isVoiceAvailable(serverSettings as any)).toBe(false);
      } finally {
        (Platform as any).OS = origOs;
      }
    });
  });
});


describe("DeviceSttEngine turn lifecycle", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    mockRequestPermissions.mockResolvedValue({ granted: true });
    mockGetSupportedLocales.mockResolvedValue({ locales: ["it-IT"], installedLocales: ["it-IT"] });
    await i18n.changeLanguage("it");
  });

  test("a finished turn stops listening, so the next engine's turn is not heard twice", async () => {
    const first = new DeviceSttEngine();
    const firstEnds = jest.fn();
    first.on("end", firstEnds);
    await first.start();
    emitNativeEvent("end", {});

    const second = new DeviceSttEngine();
    await second.start();
    emitNativeEvent("end", {});
    expect(firstEnds).toHaveBeenCalledTimes(1);
    expect(listeners.end ?? []).toHaveLength(0);
  });

  test("the end that follows an error is ignored", async () => {
    const engine = new DeviceSttEngine();
    const onError = jest.fn();
    const onEnd = jest.fn();
    engine.on("error", onError);
    engine.on("end", onEnd);
    await engine.start();
    emitNativeEvent("error", { error: "no-match" });
    emitNativeEvent("end", {});
    expect(onError).toHaveBeenCalledWith("no-match");
    expect(onEnd).not.toHaveBeenCalled();
  });

  test("a denied microphone permission fails the turn without starting the recognizer", async () => {
    mockRequestPermissions.mockResolvedValue({ granted: false });
    const engine = new DeviceSttEngine();
    const onError = jest.fn();
    engine.on("error", onError);
    await engine.start();
    expect(onError).toHaveBeenCalledWith("not-allowed");
    expect(mockStart).not.toHaveBeenCalled();
  });

  test("continuous dictation keeps every final sentence", async () => {
    const engine = new DeviceSttEngine();
    const finals: string[] = [];
    const partials: string[] = [];
    engine.on("final", (t) => finals.push(t));
    engine.on("partial", (t) => partials.push(t));
    await engine.start({ continuous: true });
    emitNativeEvent("result", { isFinal: true, results: [{ transcript: "prima frase" }] });
    emitNativeEvent("result", { isFinal: false, results: [{ transcript: "seco" }] });
    emitNativeEvent("result", { isFinal: true, results: [{ transcript: "seconda frase" }] });
    expect(partials.at(-1)).toBe("prima frase seco");
    expect(finals.at(-1)).toBe("prima frase seconda frase");
    const stopped = engine.stop();
    emitNativeEvent("end", {});
    await expect(stopped).resolves.toBe("prima frase seconda frase");
  });

  test("stop after a partial keeps that text when Android reports no-match", async () => {
    const engine = new DeviceSttEngine();
    const errors: string[] = [];
    engine.on("error", (code) => errors.push(code));
    await engine.start();
    emitNativeEvent("result", { isFinal: false, results: [{ transcript: "ciao come" }] });
    const stopped = engine.stop();
    emitNativeEvent("error", { error: "no-match" });
    await expect(stopped).resolves.toBe("ciao come");
    expect(errors).toEqual([]);
  });

  test("stop keeps the final sentence and the partial that follows", async () => {
    const engine = new DeviceSttEngine();
    await engine.start();
    emitNativeEvent("result", { isFinal: true, results: [{ transcript: "prima frase" }] });
    emitNativeEvent("result", { isFinal: false, results: [{ transcript: "seconda" }] });
    const stopped = engine.stop();
    emitNativeEvent("end", {});
    await expect(stopped).resolves.toBe("prima frase seconda");
  });

  test("an error without stop is still emitted", async () => {
    const engine = new DeviceSttEngine();
    const errors: string[] = [];
    engine.on("error", (code) => errors.push(code));
    await engine.start();
    emitNativeEvent("error", { error: "no-match" });
    expect(errors).toEqual(["no-match"]);
  });

  test("cancel after partials keeps no text", async () => {
    const engine = new DeviceSttEngine();
    await engine.start();
    emitNativeEvent("result", { isFinal: false, results: [{ transcript: "ciao come" }] });
    await engine.cancel();
    await expect(engine.stop()).resolves.toBeNull();
  });

  test("another variant of the language is not taken as the offline pack", async () => {
    // English: earlier tests cached an it-IT hit, and a cached hit is trusted.
    await i18n.changeLanguage("en");
    mockGetSupportedLocales.mockResolvedValue({ locales: ["en-GB"], installedLocales: ["en-GB"] });
    const engine = new DeviceSttEngine();
    await engine.start();
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: false }));
  });
});

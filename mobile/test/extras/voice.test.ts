import "../../src/platform/install";
import { act, renderHook } from "@testing-library/react-native";
import { sessionStore } from "../../src/state/sessionStore";
import { useVoiceInput, voiceAvailable } from "../../src/extras/voice";

const mockRec = { uri: "file:///r.m4a" as string | null, prepareToRecordAsync: jest.fn(async () => {}), record: jest.fn(), stop: jest.fn(async () => {}) };
const mockPerm = jest.fn(async () => ({ granted: true }));
const mockDel = jest.fn();
const mockMode = jest.fn(async (_m: unknown) => {});
jest.mock("expo-audio", () => ({
  useAudioRecorder: () => mockRec,
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

const transcribe = jest.fn();
const setup = (frameLimit: number | null = null) => {
  sessionStore.setState({ session: { client: { transcribeAudio: transcribe }, frameLimit } as never, state: "open" as never });
  return renderHook(() => useVoiceInput());
};
let now = 0;
beforeEach(() => {
  jest.useFakeTimers();
  now = 1000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  jest.clearAllMocks();
  mockPerm.mockResolvedValue({ granted: true });
  transcribe.mockResolvedValue("ciao");
});
afterEach(() => jest.useRealTimers());

const rec1 = async (r: { current: ReturnType<typeof useVoiceInput> }, ms: number) => {
  await act(() => r.current.start());
  now += ms;
};

test("permission denied -> error, nothing sent", async () => {
  mockPerm.mockResolvedValue({ granted: false });
  const { result } = await setup();
  await act(() => result.current.start());
  expect(result.current.state).toBe("error");
  expect(result.current.error).toBe("permission");
  expect(mockRec.record).not.toHaveBeenCalled();
  expect(transcribe).not.toHaveBeenCalled();
});

test("500 ms -> tooShort, nothing sent, file deleted", async () => {
  const { result } = await setup();
  await rec1(result, 500);
  let t: string | null = "x";
  await act(async () => { t = await result.current.stop(); });
  expect(t).toBeNull();
  expect(result.current.error).toBe("tooShort");
  expect(transcribe).not.toHaveBeenCalled();
  expect(mockDel).toHaveBeenCalled();
});

test("transcript returned as m4a data URL with duration; temp file deleted", async () => {
  const { result } = await setup();
  await rec1(result, 2000);
  let t: string | null = null;
  await act(async () => { t = await result.current.stop(); });
  expect(t).toBe("ciao");
  expect(transcribe).toHaveBeenCalledWith("data:audio/mp4;base64,QUJD", { durationMs: 2000 });
  expect(result.current.state).toBe("idle");
  expect(mockDel).toHaveBeenCalled();
});

test("transcription error sets error with detail", async () => {
  transcribe.mockRejectedValue(new Error("bad key"));
  const { result } = await setup();
  await rec1(result, 2000);
  await act(async () => { await result.current.stop(); });
  expect(result.current.state).toBe("error");
  expect(result.current.error).toBe("transcription: bad key");
});

test("payload over frame limit rejected locally", async () => {
  const { result } = await setup(10);
  await rec1(result, 2000);
  await act(async () => { await result.current.stop(); });
  expect(result.current.error).toBe("tooBig");
  expect(transcribe).not.toHaveBeenCalled();
});

test("auto-stops at 120 s and hands the transcript to onTranscript", async () => {
  sessionStore.setState({ session: { client: { transcribeAudio: transcribe }, frameLimit: null } as never, state: "open" as never });
  const got = jest.fn();
  const { result } = await renderHook(() => useVoiceInput(got));
  await act(() => result.current.start());
  await act(async () => { now += 120_000; jest.advanceTimersByTime(250); });
  await act(async () => { await Promise.resolve(); });
  expect(mockRec.stop).toHaveBeenCalled();
  expect(got).toHaveBeenCalledWith("ciao");
});

test("no session -> unavailable", async () => {
  sessionStore.setState({ session: null as never });
  const { result } = await renderHook(() => useVoiceInput());
  await act(() => result.current.start());
  expect(result.current.error).toBe("unavailable");
});

test("voiceAvailable", () => {
  const t = (o: object) => ({ transcription: { enabled: true, provider: "openai", provider_configured: true, ...o } }) as never;
  expect(voiceAvailable(t({}))).toBe(true);
  expect(voiceAvailable(t({ provider_configured: false }))).toBe(false);
  expect(voiceAvailable(t({ enabled: false }))).toBe(false);
  expect(voiceAvailable(t({ provider: "xiaomi_mimo" }))).toBe(false);
  expect(voiceAvailable(null)).toBe(false);
});

test("frame check includes the envelope reserve", async () => {
  sessionStore.setState({ session: { client: { transcribeAudio: transcribe }, frameLimit: 40, frameReserve: 20 } as never, state: "open" as never });
  const { result } = await renderHook(() => useVoiceInput());
  await rec1(result, 2000); // data URL is 26 chars; 26 + 20 > 40
  await act(async () => { await result.current.stop(); });
  expect(result.current.error).toBe("tooBig");
});

test("stop clears the timer and resets the audio mode", async () => {
  const { result } = await setup();
  const si = jest.spyOn(globalThis, "setInterval");
  const ci = jest.spyOn(globalThis, "clearInterval");
  await rec1(result, 2000);
  expect(si).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.stop(); });
  expect(ci).toHaveBeenCalledWith(si.mock.results[0].value);
  expect(mockMode).toHaveBeenLastCalledWith({ allowsRecording: false });
});

test("cancel deletes the file, sends nothing, resets mode", async () => {
  const { result } = await setup();
  const si = jest.spyOn(globalThis, "setInterval");
  const ci = jest.spyOn(globalThis, "clearInterval");
  await rec1(result, 2000);
  await act(async () => { result.current.cancel(); await Promise.resolve(); await Promise.resolve(); });
  expect(result.current.state).toBe("idle");
  expect(transcribe).not.toHaveBeenCalled();
  expect(mockDel).toHaveBeenCalled();
  expect(ci).toHaveBeenCalledWith(si.mock.results[0].value);
  expect(mockMode).toHaveBeenLastCalledWith({ allowsRecording: false });
});

test("unmount while recording stops, deletes, resets mode, clears timer", async () => {
  const { result, unmount } = await setup();
  const si = jest.spyOn(globalThis, "setInterval");
  const ci = jest.spyOn(globalThis, "clearInterval");
  await rec1(result, 2000);
  await act(async () => { unmount(); await Promise.resolve(); await Promise.resolve(); });
  expect(mockRec.stop).toHaveBeenCalled();
  expect(mockDel).toHaveBeenCalled();
  expect(mockMode).toHaveBeenLastCalledWith({ allowsRecording: false });
  expect(ci).toHaveBeenCalledWith(si.mock.results[0].value);
  expect(transcribe).not.toHaveBeenCalled();
});

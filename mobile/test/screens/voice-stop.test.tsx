import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { prefs } from "../../src/settings/prefs";
import { toast } from "../../src/ui/components/Toast";
import { VoiceButton } from "../../src/screens/thread/VoiceButton";

const mockStop = jest.fn(async () => "ciao come");

jest.mock("../../src/extras/sttEngine", () => ({
  DeviceSttEngine: class {
    on() {
      return () => undefined;
    }
    async start() {}
    stop = mockStop;
    async cancel() {}
  },
  isRecognitionAvailable: () => true,
  warnEngineUnavailableOnce: jest.fn(),
}));

jest.mock("../../src/extras/voice", () => ({
  useVoiceInput: () => ({ state: "idle", start: jest.fn(), error: null }),
  voiceAvailable: () => false,
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
  prefs.setVoiceEngine("device");
});

test("stopping dictation keeps the partial and does not toast", async () => {
  const onTranscript = jest.fn();
  const hint = jest.spyOn(toast, "show");
  const view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <VoiceButton chatKey="websocket:c1" onTranscript={onTranscript} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {
    fireEvent.press(view.getByLabelText("Voice input"));
  });
  await act(async () => {
    fireEvent.press(view.getByLabelText("Stop recording"));
  });
  expect(onTranscript).toHaveBeenCalledWith("ciao come");
  expect(hint).not.toHaveBeenCalled();
});

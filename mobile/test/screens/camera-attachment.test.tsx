import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Composer } from "../../src/screens/thread/Composer";
import { i18n } from "../../src/i18n";
import { useThreadSlice } from "../../src/state/threadStore";
import { useSession } from "../../src/state/sessionStore";
import { loadCommands } from "../../src/extras/logic";
import { prepareImage } from "../../src/core/upload";
import { toast } from "../../src/ui/components/Toast";

jest.mock("expo-image-picker", () => ({
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock("../../src/core/upload", () => {
  const actual = jest.requireActual("../../src/core/upload");
  return {
    ...actual,
    prepareImage: jest.fn(),
  };
});

jest.mock("../../src/extras/logic", () => {
  const actual = jest.requireActual("../../src/extras/logic");
  return {
    ...actual,
    loadCommands: jest.fn(),
  };
});

jest.mock("../../src/state/threadStore", () => ({
  useThreadSlice: jest.fn(),
  threadStore: jest.requireActual("../../src/state/threadStore").threadStore,
}));

jest.mock("../../src/state/sessionStore");

jest.mock("../../src/ui/components/Toast", () => ({
  toast: {
    show: jest.fn(),
    setLift: jest.fn(),
  },
}));

const mockLaunchCameraAsync = ImagePicker.launchCameraAsync as unknown as jest.Mock;
const mockRequestCameraPermissionsAsync = ImagePicker.requestCameraPermissionsAsync as unknown as jest.Mock;
const mockPrepareImage = prepareImage as unknown as jest.Mock;
const mockUseThreadSlice = useThreadSlice as unknown as jest.Mock;
const mockUseSession = useSession as unknown as jest.Mock;
const mockLoadCommands = loadCommands as unknown as jest.Mock;

const mockSend = jest.fn();
const mockSetDraft = jest.fn();
const mockSetPendingFiles = jest.fn();
const mockStop = jest.fn();

const limits = {
  max_count: 4,
  max_file_bytes: 6 * 1024 * 1024,
  max_total_bytes: 20 * 1024 * 1024,
};

function setupThread(overrides = {}) {
  mockUseThreadSlice.mockReturnValue({
    draft: "",
    setDraft: mockSetDraft,
    send: mockSend,
    running: false,
    stop: mockStop,
    messages: [],
    notices: [],
    model: null,
    preset: null,
    pendingFiles: [],
    setPendingFiles: mockSetPendingFiles,
    ...overrides,
  });
}

beforeAll(async () => {
  await i18n.changeLanguage("it");
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    session: {
      id: "s1",
      client: {
        sendMessage: jest.fn(),
        finishRunLocally: jest.fn(),
        onRuntimeModelUpdate: () => () => {},
        onChat: () => () => {},
      },
      limits,
      get: jest.fn().mockResolvedValue({}),
    },
    state: "open",
    profile: { id: "p1", name: "test" },
  });
  mockLoadCommands.mockResolvedValue([]);
  mockPrepareImage.mockImplementation(async (f: any) => f);
  setupThread();
});

describe("Part 7: Attach sheet camera", () => {
  test("attach sheet includes 'Fotocamera' and calls camera picker when granted", async () => {
    mockRequestCameraPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    mockLaunchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///photo.jpg",
          fileName: "photo.jpg",
          mimeType: "image/jpeg",
          fileSize: 1024,
        },
      ],
    });

    await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <Composer chatKey="websocket:test" />
        </ThemeProvider>
      </SafeAreaProvider>
    );

    // Open attach sheet
    const attachBtn = screen.getByLabelText("Allega");
    await act(async () => {
      fireEvent.press(attachBtn);
    });

    // "Fotocamera" option exists next to Foto and File
    const cameraOption = screen.getByText("Fotocamera");
    expect(cameraOption).toBeTruthy();
    expect(screen.getByText("Foto")).toBeTruthy();
    expect(screen.getByText("File")).toBeTruthy();

    // Tap "Fotocamera"
    await act(async () => {
      fireEvent.press(cameraOption);
    });

    // Permission requested and camera launched
    expect(mockRequestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockLaunchCameraAsync).toHaveBeenCalledWith({
      mediaTypes: ["images"],
    });

    // Image added to pendingFiles
    expect(mockSetPendingFiles).toHaveBeenCalledWith([
      expect.objectContaining({
        uri: "file:///photo.jpg",
        name: "photo.jpg",
        mime: "image/jpeg",
      }),
    ]);
  });

  test("shows toast when camera permission is denied", async () => {
    mockRequestCameraPermissionsAsync.mockResolvedValue({ granted: false, status: "denied" });

    await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <Composer chatKey="websocket:test" />
        </ThemeProvider>
      </SafeAreaProvider>
    );

    // Open attach sheet
    const attachBtn = screen.getByLabelText("Allega");
    await act(async () => {
      fireEvent.press(attachBtn);
    });

    const cameraOption = screen.getByText("Fotocamera");
    await act(async () => {
      fireEvent.press(cameraOption);
    });

    expect(mockRequestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockLaunchCameraAsync).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith("Permesso fotocamera negato");
  });
});

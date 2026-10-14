import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Composer } from "../../src/screens/thread/Composer";
import { i18n } from "../../src/i18n";
import { useThreadSlice } from "../../src/state/threadStore";
import { useSession } from "../../src/state/sessionStore";
import { loadCommands } from "../../src/extras/logic";
import { prepareImage, type LocalFile } from "../../src/core/upload";
import { toast } from "../../src/ui/components/Toast";
import { toLocalFile, formatFileSize } from "../../src/screens/thread/attachments";

jest.mock("expo-image-picker", () => ({
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

const mockLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as unknown as jest.Mock;
const mockGetDocumentAsync = DocumentPicker.getDocumentAsync as unknown as jest.Mock;
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
  max_total_bytes: 24 * 1024 * 1024,
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
    sendError: null,
    uploading: false,
    ...overrides,
  });
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    session: {
      id: "s1",
      limits,
      client: {
        onRuntimeModelUpdate: () => () => {},
        onChat: () => () => {},
      },
    } as never,
    state: "open",
    profile: null,
  });
  mockLoadCommands.mockResolvedValue([]);
  setupThread();
});

const mount = async (chatKey = "websocket:c1") => {
  const rendered = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <Composer chatKey={chatKey} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {});
  return rendered;
};

describe("pure helper toLocalFile", () => {
  test("maps document picker asset with name, mimeType, size", () => {
    const asset = {
      uri: "file:///cache/doc.pdf",
      name: "doc.pdf",
      mimeType: "application/pdf",
      size: 1024,
    };
    expect(toLocalFile(asset)).toEqual({
      uri: "file:///cache/doc.pdf",
      name: "doc.pdf",
      mime: "application/pdf",
      size: 1024,
    });
  });

  test("maps image picker asset with fileName, fileSize, infers mime", () => {
    const asset = {
      uri: "file:///cache/photo.jpg",
      fileName: "photo.jpg",
      fileSize: 2048,
    };
    expect(toLocalFile(asset)).toEqual({
      uri: "file:///cache/photo.jpg",
      name: "photo.jpg",
      mime: "image/jpeg",
      size: 2048,
    });
  });

  test("formatFileSize formats KB and MB correctly", () => {
    expect(formatFileSize(512)).toBe("1 KB");
    expect(formatFileSize(100 * 1024)).toBe("100 KB");
    expect(formatFileSize(8 * 1024 * 1024)).toBe("8.0 MB");
  });
});

describe("attachments UI behavior in Composer", () => {
  test("picking 5 files with max_count 4 shows a toast and setPendingFiles is not called", async () => {
    const spyToast = jest.spyOn(toast, "show").mockImplementation(() => {});
    const fiveFiles = Array.from({ length: 5 }, (_, i) => ({
      uri: `file:///cache/file_${i}.txt`,
      name: `file_${i}.txt`,
      mimeType: "text/plain",
      size: 100,
    }));
    mockGetDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: fiveFiles });

    await mount();
    const attachBtn = screen.getByLabelText("Attach");
    await act(async () => {
      fireEvent.press(attachBtn);
    });

    const filesOption = screen.getByText("Files");
    await act(async () => {
      fireEvent.press(filesOption);
    });

    expect(mockGetDocumentAsync).toHaveBeenCalled();
    expect(spyToast).toHaveBeenCalled();
    expect(mockSetPendingFiles).not.toHaveBeenCalled();
    spyToast.mockRestore();
  });

  test("picking an 8 MiB jpeg calls prepareImage with max_file_bytes, and the prepared file is added", async () => {
    const eightMb = 8 * 1024 * 1024;
    const rawAsset = {
      uri: "file:///cache/huge.jpg",
      fileName: "huge.jpg",
      mimeType: "image/jpeg",
      fileSize: eightMb,
    };
    const preparedFile: LocalFile = {
      uri: "file:///cache/huge_compressed.jpg",
      name: "huge.jpg",
      mime: "image/jpeg",
      size: 2 * 1024 * 1024,
    };
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [rawAsset],
    });
    mockPrepareImage.mockResolvedValueOnce(preparedFile);

    await mount();
    const attachBtn = screen.getByLabelText("Attach");
    await act(async () => {
      fireEvent.press(attachBtn);
    });

    const photosOption = screen.getByText("Photos");
    await act(async () => {
      fireEvent.press(photosOption);
    });

    expect(mockLaunchImageLibraryAsync).toHaveBeenCalled();
    expect(mockPrepareImage).toHaveBeenCalledWith(
      expect.objectContaining({ uri: rawAsset.uri, size: eightMb }),
      limits.max_file_bytes,
    );
    expect(mockSetPendingFiles).toHaveBeenCalledWith([preparedFile]);
  });

  test("the chip remove button calls setPendingFiles without that file", async () => {
    const file1: LocalFile = { uri: "file:///cache/f1.txt", name: "f1.txt", mime: "text/plain", size: 100 };
    const file2: LocalFile = { uri: "file:///cache/f2.txt", name: "f2.txt", mime: "text/plain", size: 200 };
    setupThread({ pendingFiles: [file1, file2] });

    await mount();
    expect(screen.getByText("f1.txt")).toBeTruthy();
    expect(screen.getByText("f2.txt")).toBeTruthy();

    const removeBtns = screen.getAllByLabelText("Remove");
    expect(removeBtns.length).toBe(2);
    fireEvent.press(removeBtns[0]);

    expect(mockSetPendingFiles).toHaveBeenCalledWith([file2]);
  });

  test("send with an empty draft and 1 file calls send('', { files: [f] })", async () => {
    const file1: LocalFile = { uri: "file:///cache/f1.txt", name: "f1.txt", mime: "text/plain", size: 100 };
    setupThread({ draft: "", pendingFiles: [file1] });

    await mount();
    const sendBtn = screen.getByLabelText("Send");
    expect(sendBtn.props.accessibilityState.disabled).toBe(false);

    fireEvent.press(sendBtn);
    expect(mockSend).toHaveBeenCalledWith("", { files: [file1] });
  });

  test("sendError: 'upload_failed_413' shows a toast and the chips remain", async () => {
    const spyToast = jest.spyOn(toast, "show").mockImplementation(() => {});
    const file1: LocalFile = { uri: "file:///cache/f1.txt", name: "f1.txt", mime: "text/plain", size: 100 };
    setupThread({ sendError: "upload_failed_413", pendingFiles: [file1] });

    await mount();
    expect(spyToast).toHaveBeenCalled();
    expect(screen.getByText("f1.txt")).toBeTruthy();
    spyToast.mockRestore();
  });

  test("uploading: true disables send and attach", async () => {
    const file1: LocalFile = { uri: "file:///cache/f1.txt", name: "f1.txt", mime: "text/plain", size: 100 };
    setupThread({ uploading: true, draft: "some text", pendingFiles: [file1] });

    await mount();
    const attachBtn = screen.getByLabelText("Attach");
    expect(attachBtn.props.accessibilityState.disabled).toBe(true);

    const sendBtn = screen.getByLabelText("Send");
    expect(sendBtn.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(attachBtn);
    expect(screen.queryByText("Photos")).toBeNull();

    fireEvent.press(sendBtn);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

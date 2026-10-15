import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import { File } from "expo-file-system";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import {
  createProject,
  uploadProjectFile,
  downloadProjectFile,
  deleteProjectFile,
  updateProject,
  archiveProject,
  listProjects,
  getProject,
  type Project,
  type FileEntry,
  type ProjectDetail,
} from "../../src/projects/api";
import { projectsStore } from "../../src/projects/store";
import { ProjectsScreen } from "../../src/screens/projects/ProjectsScreen";
import { ProjectDetailScreen } from "../../src/screens/projects/ProjectDetailScreen";
import { ChatDrawer } from "../../src/screens/chats/ChatDrawer";
import { ChatRow } from "../../src/screens/chats/ChatRow";
import { chatsStore } from "../../src/state/chatsStore";
import { sessionStore } from "../../src/state/sessionStore";
import type { ChatSummary } from "@/lib/types";

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

Object.defineProperty(global, "IS_REACT_ACT_ENVIRONMENT", {
  get: () => true,
  set: () => {},
  configurable: true,
});

async function renderWithTheme(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

// Mock expo-router
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  usePathname: () => "/projects",
  useNavigation: () => ({
    addListener: jest.fn(() => () => {}),
  }),
}));

// Mock BotFace animation to prevent leaked timers
jest.mock("../../src/ui/BotFace", () => ({
  BotFace: () => null,
}));

// Mock expo-file-system download
jest.mock("expo-file-system", () => {
  const actual = jest.requireActual("expo-file-system");
  return {
    ...actual,
    File: Object.assign(actual.File, {
      downloadFileAsync: jest.fn().mockResolvedValue(undefined),
    }),
  };
});

describe("P-A: Projects API", () => {
  const fakeSession = {
    baseUrl: "https://nanobot.local",
    apiToken: () => "secret-token",
    get: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  test("createProject sends POST JSON with the Bearer header", async () => {
    const fakeProject: Project = {
      id: "proj-1",
      name: "New Project",
      description: "My project desc",
      path: "/home/bot/workspace/projects/proj-1",
      created_at: 1000,
      updated_at: 1000,
      file_count: 0,
      size_bytes: 0,
    };

    ((global as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project: fakeProject }),
    });

    const res = await createProject(fakeSession, { name: "New Project", description: "My project desc" });
    expect(res.project.id).toBe("proj-1");

    expect(fetch).toHaveBeenCalledWith(
      "https://nanobot.local/api/ext/projects",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "New Project", description: "My project desc" }),
      })
    );
  });

  test("uploadProjectFile sends the raw body with ?path= encoded and X-Overwrite only when asked", async () => {
    const fakeFileEntry: FileEntry = { path: "sub dir/test.txt", size: 100, modified_at: 2000 };
    ((global as any).fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ file: fakeFileEntry }),
    });

    // 1. Without overwrite
    await uploadProjectFile(fakeSession, "proj-1", "sub dir/test.txt", {
      uri: "file:///local/cache/test.txt",
      name: "test.txt",
      mime: "text/plain",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://nanobot.local/api/ext/projects/proj-1/files?path=sub%20dir%2Ftest.txt",
      expect.objectContaining({
        method: "POST",
        headers: expect.not.objectContaining({ "X-Overwrite": "1" }),
      })
    );

    // 2. With overwrite
    await uploadProjectFile(
      fakeSession,
      "proj-1",
      "sub dir/test.txt",
      { uri: "file:///local/cache/test.txt", name: "test.txt", mime: "text/plain" },
      true
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://nanobot.local/api/ext/projects/proj-1/files?path=sub%20dir%2Ftest.txt",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Overwrite": "1" }),
      })
    );
  });

  test("a server {error:'file_exists'} 409 -> Error('file_exists')", async () => {
    ((global as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ error: "file_exists" }),
      json: async () => ({ error: "file_exists" }),
    });

    await expect(
      uploadProjectFile(fakeSession, "proj-1", "exists.txt", {
        uri: "file:///tmp/exists.txt",
        name: "exists.txt",
      })
    ).rejects.toThrow("file_exists");
  });

  test("downloadProjectFile refuses over 32 MB", async () => {
    const bigFile: FileEntry = {
      path: "huge.zip",
      size: 33 * 1024 * 1024,
      modified_at: 5000,
    };

    await expect(downloadProjectFile(fakeSession, "proj-1", bigFile)).rejects.toThrow("too_large");
    expect(File.downloadFileAsync).not.toHaveBeenCalled();
  });
});

describe("P-A: ChatRow project pill", () => {
  const proj: Project = {
    id: "p1",
    name: "Super Project",
    path: "/bot/workspace/projects/p1",
    created_at: 1000,
    updated_at: 1000,
    file_count: 1,
    size_bytes: 100,
  };

  beforeEach(async () => {
    await i18n.changeLanguage("it");
    projectsStore.setState({
      projects: [proj],
      byPath: Object.assign((p: string) => (p === proj.path ? proj : undefined), { [proj.path]: proj }),
    });
  });

  afterEach(() => {
    projectsStore.getState().reset();
  });

  test("shows the project pill for a matching path", async () => {
    const matchingChat: ChatSummary = {
      key: "websocket:chat1",
      channel: "websocket",
      chatId: "chat1",
      createdAt: "2026-01-01",
      title: "Project Chat",
      preview: "hello",
      updatedAt: null,
      workspaceScope: { project_path: "/bot/workspace/projects/p1", access_mode: "restricted" },
    };

    const { unmount } = await renderWithTheme(
      <ChatRow chat={matchingChat} active={false} onPress={jest.fn()} onLongPress={jest.fn()} />
    );
    expect(screen.getByText("Super Project")).toBeTruthy();
    unmount();
  });

  test("does not show the project pill for a non-matching path", async () => {
    const nonMatchingChat: ChatSummary = {
      key: "websocket:chat2",
      channel: "websocket",
      chatId: "chat2",
      createdAt: "2026-01-01",
      title: "Other Chat",
      preview: "bye",
      updatedAt: null,
      workspaceScope: { project_path: "/bot/workspace/projects/other", access_mode: "restricted" },
    };

    const { unmount } = await renderWithTheme(
      <ChatRow chat={nonMatchingChat} active={false} onPress={jest.fn()} onLongPress={jest.fn()} />
    );
    expect(screen.queryByText("Super Project")).toBeNull();
    unmount();
  });
});

describe("P-A: ProjectsScreen", () => {
  let fakeSession: any;

  const fakeProjects: Project[] = [
    {
      id: "p1",
      name: "Existing Project",
      description: "Existing desc",
      path: "/home/bot/projects/p1",
      created_at: 1000,
      updated_at: 1000,
      file_count: 2,
      size_bytes: 500,
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    fakeSession = {
      baseUrl: "https://nanobot.local",
      apiToken: () => "secret-token",
      get: jest.fn().mockResolvedValue({ projects: [] }),
    };
    await i18n.changeLanguage("it");
    projectsStore.getState().reset();
    sessionStore.setState({ session: fakeSession, state: "open", profile: null });
    chatsStore.setState({ chats: [] });
  });

  test("renders projects from a fake session", async () => {
    fakeSession.get.mockResolvedValueOnce({ projects: fakeProjects });

    const { unmount } = await renderWithTheme(<ProjectsScreen />);
    expect(await screen.findByText("Existing Project")).toBeTruthy();
    expect(screen.getByText("Existing desc")).toBeTruthy();
    unmount();
  });

  test("tap 'Nuovo progetto' -> input name -> calls createProject -> navigates to /projects/<id>", async () => {
    fakeSession.get.mockResolvedValue({ projects: [] });

    ((global as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        project: {
          id: "p-new",
          name: "My Brand New Project",
          path: "/home/bot/projects/p-new",
          created_at: 2000,
          updated_at: 2000,
          file_count: 0,
          size_bytes: 0,
        },
      }),
    });

    const { unmount } = await renderWithTheme(<ProjectsScreen />);
    // Click "Nuovo progetto"
    const newBtn = await screen.findByText("Nuovo progetto");
    fireEvent.press(newBtn);

    // Enter name using label "Nome"
    const nameInput = await screen.findByLabelText("Nome");
    fireEvent.changeText(nameInput, "My Brand New Project");
    await screen.findByDisplayValue("My Brand New Project");

    // Tap "Salva"
    const saveBtn = screen.getByText("Salva");
    fireEvent.press(saveBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://nanobot.local/api/ext/projects",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "My Brand New Project" }),
        })
      );
    });
    expect(router.push).toHaveBeenCalledWith("/projects/p-new");
    unmount();
  });
});

describe("P-A: ProjectDetailScreen", () => {
  let fakeSession: any;

  const fakeDetail: ProjectDetail = {
    project: {
      id: "p1",
      name: "Detail Project",
      description: "Detail description",
      path: "/home/bot/projects/p1",
      created_at: 1000,
      updated_at: 1000,
      file_count: 1,
      size_bytes: 2048,
    },
    instructions: "These are special project instructions.",
    files: [
      {
        path: "spec.pdf",
        size: 2048,
        modified_at: 1500,
      },
    ],
    truncated: false,
  };

  const matchingChat: ChatSummary = {
    key: "websocket:chat-p1",
    channel: "websocket",
    chatId: "chat-p1",
    createdAt: "2026-01-01",
    title: "Chat in Project",
    preview: "hello project",
    updatedAt: null,
    workspaceScope: { project_path: "/home/bot/projects/p1", access_mode: "restricted" },
  };

  const outsideChat: ChatSummary = {
    key: "websocket:chat-out",
    channel: "websocket",
    chatId: "chat-out",
    createdAt: "2026-01-01",
    title: "Chat Outside",
    preview: "hello outside",
    updatedAt: null,
    workspaceScope: { project_path: "/home/bot/projects/other", access_mode: "restricted" },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    fakeSession = {
      baseUrl: "https://nanobot.local",
      apiToken: () => "secret-token",
      get: jest.fn().mockImplementation(async (path: string) => {
        if (path.startsWith("/api/ext/projects/p1")) {
          return fakeDetail;
        }
        return { projects: [] };
      }),
    };
    await i18n.changeLanguage("it");
    projectsStore.getState().reset();
    sessionStore.setState({ session: fakeSession, state: "open", profile: null });
    chatsStore.setState({ chats: [matchingChat, outsideChat] });
  });

  test("shows instructions preview, files, and only matching chats", async () => {
    const { unmount } = await renderWithTheme(<ProjectDetailScreen id="p1" />);

    // Instructions
    expect(await screen.findByText("These are special project instructions.")).toBeTruthy();
    // Files
    expect(screen.getByText("spec.pdf")).toBeTruthy();
    // Matching Chat
    expect(screen.getByText("Chat in Project")).toBeTruthy();
    // Outside Chat should not be in the list
    expect(screen.queryByText("Chat Outside")).toBeNull();

    unmount();
  });

  test("'Nuova chat nel progetto' calls newChat with restricted project scope", async () => {
    const newChatMock = jest.fn().mockResolvedValue("websocket:chat-new");
    chatsStore.setState({ newChat: newChatMock as any });

    const { unmount } = await renderWithTheme(<ProjectDetailScreen id="p1" />);
    const newChatBtn = await screen.findByText("Nuova chat nel progetto");

    fireEvent.press(newChatBtn);

    await waitFor(() => {
      expect(newChatMock).toHaveBeenCalledWith({
        project_path: "/home/bot/projects/p1",
        access_mode: "restricted",
      });
      expect(router.push).toHaveBeenCalledWith("/chat/websocket%3Achat-new");
    });

    unmount();
  });

  test("deleting a file opens confirmation dialog before delete", async () => {
    ((global as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const { unmount } = await renderWithTheme(<ProjectDetailScreen id="p1" />);
    const fileRowText = await screen.findByText("spec.pdf");

    // Long press to trigger delete confirmation
    fireEvent(fileRowText, "longPress");

    // Confirmation dialog appears
    expect(await screen.findByText("Elimina file?")).toBeTruthy();

    // Confirm deletion
    const confirmDeleteBtn = screen.getByText("Elimina");
    fireEvent.press(confirmDeleteBtn);

    expect(fetch).toHaveBeenCalledWith(
      "https://nanobot.local/api/ext/projects/p1/files/delete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "spec.pdf" }),
      })
    );

    unmount();
  });
});

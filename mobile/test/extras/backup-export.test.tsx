import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import type { ChatSummary, UIMessage } from "@/lib/types";
import { chatsStore } from "../../src/state/chatsStore";
import { projectsStore } from "../../src/projects/store";
import { fakeSession, thread } from "../state/fake";
import {
  chatToMarkdown,
  exportChat,
  exportProject,
  projectToMarkdown,
} from "../../src/extras/exportChat";
import { backupStore } from "../../src/extras/backup";
import { BackupSection } from "../../src/screens/settings/BackupSection";
import { SettingsScreen, SECTIONS } from "../../src/screens/settings/SettingsScreen";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";
import { ProjectDetailScreen } from "../../src/screens/projects/ProjectDetailScreen";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as readingPages from "../../src/screens/viewer/readingPages";

const writtenFiles: { name: string; content: string; uri: string }[] = [];

jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({ create: jest.fn() })),
  File: jest.fn((_dir: unknown, name: string) => {
    const uri = `file:///cache/exports/${name}`;
    return {
      uri,
      write: jest.fn((content: string) => {
        writtenFiles.push({ name, content, uri });
      }),
    };
  }),
  Paths: { cache: { uri: "file:///cache" } },
}));

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file:///cache/printed.pdf" })),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }),
  usePathname: () => "/projects",
}));

const mockRunRestart = jest.fn(async () => {});

jest.mock("../../src/settings/store", () => {
  const actual = jest.requireActual("../../src/settings/store");
  return {
    ...actual,
    useRestart: () => ({
      pending: false,
      sections: [],
      state: "idle",
      run: mockRunRestart,
    }),
  };
});

jest.mock("../../src/ui/BotFace", () => {
  const { View } = require("react-native");
  return {
    BotFace: ({ state }: { state: string }) => <View testID={`botface-${state}`} />,
  };
});

const wrap = async (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

describe("BK-A: Backup and Export", () => {
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    await i18n.changeLanguage("it");
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    writtenFiles.length = 0;
    originalFetch = global.fetch;
    await i18n.changeLanguage("it");
    backupStore.getState().reset();
    threadStore.getState().reset();
    chatsStore.setState({ chats: [], overrides: {}, loading: false });
    projectsStore.getState().reset();
    sessionStore.setState({
      session: null,
      state: "open" as never,
      profile: { id: "p1", baseUrl: "http://testserver", name: "nanobot" } as never,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 1. chatToMarkdown pure tests
  describe("chatToMarkdown", () => {
    test("user and assistant messages are rendered in order with their labels; fenced code block stays intact; attachments become [file: name]", () => {
      const messages: UIMessage[] = [
        {
          id: "m1",
          role: "user",
          content: "Ciao nanobot, guarda questo file",
          createdAt: new Date("2026-10-16T08:00:00Z").getTime(),
          media: [{ url: "/api/files/report.csv", name: "report.csv", kind: "file" }],
        },
        {
          id: "m2",
          role: "assistant",
          content: "Ecco il codice:\n```python\ndef hello():\n    print(\"world\")\n```",
          createdAt: new Date("2026-10-16T08:01:00Z").getTime(),
        },
      ];

      const md = chatToMarkdown("Analisi dati", messages, { now: new Date("2026-10-16T10:00:00Z") });

      expect(md).toContain("# Analisi dati");
      const userIdx = md.indexOf("**Tu**");
      const botIdx = md.indexOf("**nanobot**");
      expect(userIdx).toBeGreaterThan(-1);
      expect(botIdx).toBeGreaterThan(userIdx);

      // Attachment rendered as [file: report.csv] without binary/url
      expect(md).toContain("[file: report.csv]");
      expect(md).not.toContain("/api/files/report.csv");

      // Fenced code block intact
      expect(md).toContain("```python\ndef hello():\n    print(\"world\")\n```");
    });

    test("tool traces are excluded by default and included when includeTools is true", () => {
      const messages: UIMessage[] = [
        {
          id: "m1",
          role: "user",
          content: "Cerca file",
          createdAt: new Date("2026-10-16T08:00:00Z").getTime(),
        },
        {
          id: "t1",
          role: "assistant",
          kind: "trace",
          content: "read_file({\"path\":\"a.txt\"})",
          createdAt: new Date("2026-10-16T08:00:30Z").getTime(),
          toolEvents: [{ name: "read_file", phase: "end" }],
          traces: ["read_file a.txt"],
        },
        {
          id: "m2",
          role: "assistant",
          content: "Fatto.",
          reasoning: "Pensiero interno segreto",
          toolEvents: [{ name: "exec_shell", phase: "end" }],
          createdAt: new Date("2026-10-16T08:01:00Z").getTime(),
        },
      ];

      const mdDefault = chatToMarkdown("Test Tools", messages);
      expect(mdDefault).not.toContain("> tool:");
      expect(mdDefault).not.toContain("read_file");
      expect(mdDefault).not.toContain("exec_shell");
      expect(mdDefault).not.toContain("Pensiero interno segreto");
      expect(mdDefault).toContain("Fatto.");

      const mdWithTools = chatToMarkdown("Test Tools", messages, { includeTools: true });
      expect(mdWithTools).toContain("> tool: read_file");
      expect(mdWithTools).toContain("> tool: exec_shell");
      // Thinking/reasoning is still excluded
      expect(mdWithTools).not.toContain("Pensiero interno segreto");
    });

    test("empty chat still has the title", () => {
      const md = chatToMarkdown("Chat vuota", []);
      expect(md).toContain("# Chat vuota");
    });
  });

  // 2. Chat export MD & PDF
  describe("Chat export (MD and PDF)", () => {
    test("Chat export MD writes a .md file to cache and calls Sharing.shareAsync with its URI", async () => {
      const f = fakeSession();
      sessionStore.setState({ session: f.session });
      threadStore.setState({
        threads: {
          "webui:c1": {
            messages: [
              { id: "1", role: "user", content: "Domanda 1", createdAt: new Date("2026-10-16T08:00:00Z").getTime() },
              { id: "2", role: "assistant", content: "Risposta 1", createdAt: new Date("2026-10-16T08:01:00Z").getTime() },
            ],
            loaded: true,
            running: false,
            model: null,
            preset: null,
            notices: [],
            draft: "",
            stopped: false,
            sendError: null,
            uploading: false,
            pendingFiles: [],
            forkBoundary: null,
            temporary: false,
          },
        },
      });

      await exportChat({
        session: f.session,
        chatKey: "webui:c1",
        title: "Mia Chat",
        format: "md",
      });

      expect(writtenFiles).toHaveLength(1);
      expect(writtenFiles[0].name).toMatch(/^mia-chat-\d{4}-\d{2}-\d{2}\.md$/);
      expect(writtenFiles[0].content).toContain("# Mia Chat");
      expect(writtenFiles[0].content).toContain("Domanda 1");
      expect(writtenFiles[0].content).toContain("Risposta 1");
      expect(Sharing.shareAsync).toHaveBeenCalledWith(writtenFiles[0].uri, expect.anything());
    });

    test("Chat export PDF goes through markdownToPrintHtml and Print.printToFileAsync, then shares the PDF URI", async () => {
      const spyHtml = jest.spyOn(readingPages, "markdownToPrintHtml");
      const f = fakeSession();
      sessionStore.setState({ session: f.session });
      threadStore.setState({
        threads: {
          "webui:c1": {
            messages: [{ id: "1", role: "user", content: "Test PDF", createdAt: new Date("2026-10-16T08:00:00Z").getTime() }],
            loaded: true,
            running: false,
            model: null,
            preset: null,
            notices: [],
            draft: "",
            stopped: false,
            sendError: null,
            uploading: false,
            pendingFiles: [],
            forkBoundary: null,
            temporary: false,
          },
        },
      });

      await exportChat({
        session: f.session,
        chatKey: "webui:c1",
        title: "Mia Chat PDF",
        format: "pdf",
      });

      expect(spyHtml).toHaveBeenCalled();
      expect(Print.printToFileAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining("<!DOCTYPE html>"),
        }),
      );
      expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/printed.pdf", expect.anything());
      spyHtml.mockRestore();
    });
  });

  // 3. Project export
  describe("Project export", () => {
    const projectPath = "/home/bot/workspace/projects/p1";
    const sampleDetail = {
      project: {
        id: "p1",
        name: "Progetto Alfa",
        description: "Descrizione del progetto",
        path: projectPath,
        created_at: 1000,
        updated_at: 2000,
        file_count: 2,
        size_bytes: 3072,
      },
      instructions: "Usa sempre un tono formale.",
      truncated: false,
      files: [
        { path: "docs/spec.md", size: 1024, modified_at: 1000 },
        { path: "data.json", size: 2048, modified_at: 1500 },
      ],
    };

    test("includes instructions, file list, and only that project's chats; stops at 30 chats", async () => {
      // Create 35 chats belonging to p1 + 2 chats belonging to another project / no project
      const chats: ChatSummary[] = [];
      const routes: Record<string, unknown> = {};
      for (let i = 1; i <= 35; i++) {
        const key = `webui:p1-chat-${i}`;
        chats.push({
          key,
          chatId: `p1-chat-${i}`,
          channel: "webui",
          createdAt: new Date(2026, 9, 16, 0, i).toISOString(),
          preview: `Messaggio nella chat ${i}`,
          title: `Chat P1 #${i}`,
          updatedAt: new Date(2026, 9, 16, 0, i).toISOString(),
          workspaceScope: { access_mode: "restricted", project_path: projectPath },
        });
        routes[`/api/sessions/${encodeURIComponent(key)}/webui-thread`] = thread([
          { event: "user_message", chat_id: `p1-chat-${i}`, text: `Messaggio nella chat ${i}`, starts_turn: true, turn_id: `t-${i}` },
          { event: "turn_end", chat_id: `p1-chat-${i}`, turn_id: `t-${i}` },
        ], { completed_turn_ids: [`t-${i}`] });
      }
      // Unrelated chats
      const otherKey = "webui:other-chat";
      chats.push({
        key: otherKey,
        chatId: "other-chat",
        channel: "webui",
        createdAt: new Date().toISOString(),
        preview: "Messaggio segreto altro progetto",
        title: "Chat Altro Progetto",
        updatedAt: new Date().toISOString(),
        workspaceScope: { access_mode: "restricted", project_path: "/other/path" },
      });
      routes[`/api/sessions/${encodeURIComponent(otherKey)}/webui-thread`] = thread([
        { event: "user_message", chat_id: "other-chat", text: "Messaggio segreto altro progetto", starts_turn: true, turn_id: "t-other" },
        { event: "turn_end", chat_id: "other-chat", turn_id: "t-other" },
      ], { completed_turn_ids: ["t-other"] });

      chatsStore.setState({ chats });
      const f = fakeSession(routes);
      sessionStore.setState({ session: f.session });

      const progressCalls: [number, number][] = [];
      await exportProject({
        session: f.session,
        detail: sampleDetail,
        format: "md",
        onProgress: (cur, tot) => progressCalls.push([cur, tot]),
      });

      expect(writtenFiles).toHaveLength(1);
      const md = writtenFiles[0].content;

      // Project metadata & instructions
      expect(md).toContain("# Progetto Alfa");
      expect(md).toContain("Descrizione del progetto");
      expect(md).toContain("Usa sempre un tono formale.");

      // File list (paths and sizes, no file contents)
      expect(md).toContain("docs/spec.md");
      expect(md).toContain("data.json");

      // Only p1 chats, capped at 30
      expect(progressCalls).toHaveLength(30);
      expect(progressCalls[0]).toEqual([1, 30]);
      expect(progressCalls[29]).toEqual([30, 30]);

      expect(md).toContain("Messaggio nella chat 1");
      expect(md).toContain("Messaggio nella chat 30");
      expect(md).not.toContain("Messaggio nella chat 31");
      expect(md).not.toContain("Messaggio segreto altro progetto");
      expect(md).not.toContain("Chat Altro Progetto");

      expect(Sharing.shareAsync).toHaveBeenCalledWith(writtenFiles[0].uri, expect.anything());
    });

    test("cancelling project export stops hydration and does not call Sharing.shareAsync", async () => {
      const chats: ChatSummary[] = [
        {
          key: "webui:c1",
          chatId: "c1",
          channel: "webui",
          createdAt: new Date().toISOString(),
          preview: "1",
          title: "Chat 1",
          updatedAt: new Date().toISOString(),
          workspaceScope: { access_mode: "restricted", project_path: projectPath },
        },
        {
          key: "webui:c2",
          chatId: "c2",
          channel: "webui",
          createdAt: new Date().toISOString(),
          preview: "2",
          title: "Chat 2",
          updatedAt: new Date().toISOString(),
          workspaceScope: { access_mode: "restricted", project_path: projectPath },
        },
        {
          key: "webui:c3",
          chatId: "c3",
          channel: "webui",
          createdAt: new Date().toISOString(),
          preview: "3",
          title: "Chat 3",
          updatedAt: new Date().toISOString(),
          workspaceScope: { access_mode: "restricted", project_path: projectPath },
        },
      ];
      chatsStore.setState({ chats });

      let cancelled = false;
      const routes: Record<string, unknown> = {
        [`/api/sessions/${encodeURIComponent("webui:c1")}/webui-thread`]: () => {
          cancelled = true; // Cancel right after first chat starts/finishes hydrating
          return thread([
            { event: "user_message", chat_id: "c1", text: "Uno", starts_turn: true, turn_id: "t1" },
            { event: "turn_end", chat_id: "c1", turn_id: "t1" },
          ], { completed_turn_ids: ["t1"] });
        },
        [`/api/sessions/${encodeURIComponent("webui:c2")}/webui-thread`]: () =>
          thread([
            { event: "user_message", chat_id: "c2", text: "Due", starts_turn: true, turn_id: "t2" },
            { event: "turn_end", chat_id: "c2", turn_id: "t2" },
          ], { completed_turn_ids: ["t2"] }),
        [`/api/sessions/${encodeURIComponent("webui:c3")}/webui-thread`]: () =>
          thread([
            { event: "user_message", chat_id: "c3", text: "Tre", starts_turn: true, turn_id: "t3" },
            { event: "turn_end", chat_id: "c3", turn_id: "t3" },
          ], { completed_turn_ids: ["t3"] }),
      };

      const f = fakeSession(routes);
      sessionStore.setState({ session: f.session });

      await exportProject({
        session: f.session,
        detail: sampleDetail,
        format: "md",
        isCancelled: () => cancelled,
      });

      // Should have stopped after chat 1 and never hydrated chat 2 or 3
      expect(f.get).toHaveBeenCalledTimes(1);
      expect(writtenFiles).toHaveLength(0);
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
    });
  });

  // 4. Backup section
  describe("BackupSection", () => {
    const sampleBackupPayload = {
      backups: [
        { name: "nanobot-backup-20261016-090000.tar.gz", size: 5242880, created_at: 1760605200000 },
        { name: "nanobot-backup-20261015-090000.tar.gz", size: 4194304, created_at: 1760518800000 },
      ],
      max_backups: 5,
      dir: "/home/user/.nanobot/backups",
      disk_free: 10737418240, // 10 GB
      workspace_included: true,
    };

    test("SettingsScreen includes backup section after system", () => {
      const sysIdx = SECTIONS.indexOf("system" as any);
      const bkIdx = SECTIONS.indexOf("backup" as any);
      expect(sysIdx).toBeGreaterThan(-1);
      expect(bkIdx).toBeGreaterThan(sysIdx);
    });

    test("Backup list renders newest first with the 'più recente' badge on the first item", async () => {
      const f = fakeSession();
      sessionStore.setState({ session: f.session });

      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => sampleBackupPayload,
      })) as never;

      await wrap(<BackupSection />);

      await waitFor(() => {
        expect(screen.getByText(i18n.t("backup.latest"))).toBeTruthy();
      });

      const items = screen.getAllByTestId("backup-item");
      expect(items).toHaveLength(2);
      // First item has the "più recente" badge
      const badges = screen.getAllByText(i18n.t("backup.latest"));
      expect(badges).toHaveLength(1);
    });

    test("Create backup button shows spinner while pending, then refreshes the list", async () => {
      const f = fakeSession();
      sessionStore.setState({ session: f.session });

      let resolveCreate: ((v: any) => void) | null = null;
      const newBackup = {
        name: "nanobot-backup-20261016-100000.tar.gz",
        size: 6291456,
        created_at: 1760608800000,
      };

      let getCalls = 0;
      global.fetch = jest.fn((url: string) => {
        if (url.endsWith("/api/ext/backup/create")) {
          return new Promise((res) => {
            resolveCreate = () =>
              res({
                ok: true,
                status: 200,
                json: async () => ({ backup: newBackup }),
              });
          });
        }
        getCalls++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () =>
            getCalls === 1
              ? sampleBackupPayload
              : { ...sampleBackupPayload, backups: [newBackup, ...sampleBackupPayload.backups] },
        });
      }) as never;

      await wrap(<BackupSection />);

      await waitFor(() => {
        expect(screen.getAllByTestId("backup-item")).toHaveLength(2);
      });

      const createBtn = screen.getByRole("button", { name: new RegExp(i18n.t("backup.createNow"), "i") });
      await act(async () => {
        fireEvent.press(createBtn);
      });

      // Spinner shown while pending
      expect(screen.getByTestId("backup-creating-spinner")).toBeTruthy();

      // Finish create
      await act(async () => {
        resolveCreate?.(null);
      });

      await waitFor(() => {
        expect(screen.getAllByTestId("backup-item")).toHaveLength(3);
      });
    });

    test("Create backup returning 409 backup_in_progress shows the localized message", async () => {
      const f = fakeSession();
      sessionStore.setState({ session: f.session });

      global.fetch = jest.fn(async (url: string) => {
        if (url.endsWith("/api/ext/backup/create")) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: "backup_in_progress" }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => sampleBackupPayload,
        };
      }) as never;

      await wrap(<BackupSection />);

      await waitFor(() => {
        expect(screen.getAllByTestId("backup-item")).toHaveLength(2);
      });

      const createBtn = screen.getByRole("button", { name: new RegExp(i18n.t("backup.createNow"), "i") });
      await act(async () => {
        fireEvent.press(createBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(i18n.t("backup.inProgress"))).toBeTruthy();
      });
      expect(screen.queryByText("backup_in_progress")).toBeNull();
    });

    test("Delete asks for confirm before posting /api/ext/backup/delete", async () => {
      const f = fakeSession();
      sessionStore.setState({ session: f.session });

      const fetchMock = jest.fn(async (url: string) => {
        if (url.endsWith("/api/ext/backup/delete")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => sampleBackupPayload,
        };
      });
      global.fetch = fetchMock as never;

      await wrap(<BackupSection />);

      await waitFor(() => {
        expect(screen.getAllByTestId("backup-item")).toHaveLength(2);
      });

      const deleteBtns = screen.getAllByLabelText(i18n.t("backup.delete"));
      await act(async () => {
        fireEvent.press(deleteBtns[0]);
      });

      // Has not posted delete yet
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining("/api/ext/backup/delete"),
        expect.anything(),
      );

      // Confirm dialog is open
      expect(screen.getByText(i18n.t("backup.deleteConfirmTitle"))).toBeTruthy();

      const deleteButtons = screen.getAllByRole("button", { name: i18n.t("common.delete") });
      // The last one is the Dialog confirm button
      const confirmBtn = deleteButtons[deleteButtons.length - 1];
      await act(async () => {
        fireEvent.press(confirmBtn);
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "http://h/api/ext/backup/delete",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ name: "nanobot-backup-20261016-090000.tar.gz" }),
          }),
        );
      });
    });

    test("Restore asks for the strong confirm dialog, sends confirm: true, and triggers useRestart().run", async () => {
      const f = fakeSession();
      sessionStore.setState({ session: f.session });

      const fetchMock = jest.fn(async (url: string) => {
        if (url.endsWith("/api/ext/backup/restore")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              restored: "nanobot-backup-20261016-090000.tar.gz",
              previous: "/home/user/.nanobot/backups/pre-restore-20261016-091000",
              restart_required: true,
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => sampleBackupPayload,
        };
      });
      global.fetch = fetchMock as never;

      await wrap(<BackupSection />);

      await waitFor(() => {
        expect(screen.getAllByTestId("backup-item")).toHaveLength(2);
      });

      const restoreBtns = screen.getAllByLabelText(i18n.t("backup.restore"));
      await act(async () => {
        fireEvent.press(restoreBtns[0]);
      });

      // Strong confirm dialog is open before any restore request
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining("/api/ext/backup/restore"),
        expect.anything(),
      );
      expect(screen.getByText(i18n.t("backup.restoreConfirmTitle"))).toBeTruthy();

      const restoreButtons = screen.getAllByRole("button", { name: i18n.t("backup.restoreConfirm") });
      const confirmBtn = restoreButtons[restoreButtons.length - 1];
      await act(async () => {
        fireEvent.press(confirmBtn);
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "http://h/api/ext/backup/restore",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              name: "nanobot-backup-20261016-090000.tar.gz",
              confirm: true,
            }),
          }),
        );
      });

      expect(mockRunRestart).toHaveBeenCalled();
    });

    test("workspace_included: false renders the workspace warning card", async () => {
      const f = fakeSession();
      sessionStore.setState({ session: f.session });

      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleBackupPayload, workspace_included: false }),
      })) as never;

      await wrap(<BackupSection />);

      await waitFor(() => {
        expect(screen.getByText(i18n.t("backup.workspaceExcludedWarning"))).toBeTruthy();
      });
    });

    test("No download button or element exists in the backup section", async () => {
      const f = fakeSession();
      sessionStore.setState({ session: f.session });

      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => sampleBackupPayload,
      })) as never;

      await wrap(<BackupSection />);

      await waitFor(() => {
        expect(screen.getAllByTestId("backup-item")).toHaveLength(2);
      });

      expect(screen.queryByText(/scarica|download/i)).toBeNull();
      expect(screen.queryByTestId(/download/i)).toBeNull();
    });

    test("Profile switch mid-request drops the stale result", async () => {
      let resolveFetch: ((v: any) => void) | null = null;
      global.fetch = jest.fn(() => {
        return new Promise((res) => {
          resolveFetch = () =>
            res({
              ok: true,
              status: 200,
              json: async () => sampleBackupPayload,
            });
        });
      }) as never;

      const f = fakeSession();
      sessionStore.setState({
        session: f.session,
        profile: { id: "profile-1", baseUrl: "http://h1", name: "P1" } as never,
      });

      const refreshPromise = backupStore.getState().refresh();

      // Switch profile mid-request
      await act(async () => {
        sessionStore.setState({
          profile: { id: "profile-2", baseUrl: "http://h2", name: "P2" } as never,
        });
      });

      await act(async () => {
        resolveFetch?.(null);
        await refreshPromise;
      });

      expect(backupStore.getState().data).toBeNull();
    });
  });
});

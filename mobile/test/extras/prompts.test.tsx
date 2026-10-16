import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { chatsStore } from "../../src/state/chatsStore";
import { threadStore } from "../../src/state/threadStore";
import { projectsStore } from "../../src/projects/store";
import { toast } from "../../src/ui/components";
import { fakeSession } from "../state/fake";
import {
  fillPrompt,
  extractVariables,
  promptsStore,
  type PromptItem,
} from "../../src/extras/prompts";
import { PromptPickerSheet } from "../../src/extras/PromptPickerSheet";
import { PromptEditorSheet } from "../../src/extras/PromptEditorSheet";
import { PromptsSection } from "../../src/screens/settings/PromptsSection";
import { ProjectDetailScreen } from "../../src/screens/projects/ProjectDetailScreen";

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router");
  return {
    ...actual,
    useNavigation: () => ({ addListener: jest.fn(() => () => {}), dispatch: jest.fn() }),
  };
});

jest.mock("../../src/ui/components/Toast", () => {
  const actual = jest.requireActual("../../src/ui/components/Toast");
  return {
    ...actual,
    toast: {
      show: jest.fn(),
      setLift: jest.fn(),
    },
  };
});

const wrap = async (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("PL-A: prompts", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    promptsStore.getState().reset();
    projectsStore.getState().reset();
    sessionStore.setState({
      session: null,
      state: "open" as never,
      profile: { id: "p1", baseUrl: "http://h", name: "nanobot" } as never,
    });
    chatsStore.setState({
      chats: [],
      loading: false,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("fillPrompt: multiple and repeated variables, spaces inside the braces, an unknown name left untouched, $& in a value inserted literally, 41-char variable ignored, and {{constructor}} untouched with {}", () => {
    const longName = "a".repeat(41);
    const maxName = "b".repeat(40);
    const template = `Hello {{ name }}, welcome to {{ place }}! Again, {{name}}. Price is {{price}}, and {{  unknown_var  }}. Long: {{ ${longName} }}, Max: {{ ${maxName} }}, Proto: {{constructor}}.`;
    const values = {
      name: "Alice",
      place: "Wonderland",
      price: "$& discount",
      [longName]: "SHOULD_NOT_REPLACE",
      [maxName]: "MAX_OK",
    };

    const result = fillPrompt(template, values);
    expect(result).toBe(
      `Hello Alice, welcome to Wonderland! Again, Alice. Price is $& discount, and {{  unknown_var  }}. Long: {{ ${longName} }}, Max: MAX_OK, Proto: {{constructor}}.`,
    );

    // {{constructor}} with empty object stays "{{constructor}}"
    expect(fillPrompt("{{constructor}}", {})).toBe("{{constructor}}");

    // Variable extraction ignores 41-char variable name and keeps up to 40-char name
    expect(extractVariables(template)).toEqual([
      "name",
      "place",
      "price",
      "unknown_var",
      maxName,
      "constructor",
    ]);
    expect(extractVariables(`{{ ${longName} }}`)).toEqual([]);
  });

  test("the picker in a project chat requests ?project=<id> (even when projectsStore is not loaded yet). A chat with no project requests the global list", async () => {
    const globalPrompt: PromptItem = {
      id: "pr-1",
      title: "Global Review",
      body: "Please review this code.\nSecond line hidden.",
      project_id: null,
      variables: [],
      created_at: 1000,
      updated_at: 1000,
      used_at: null,
    };

    const projectPrompt: PromptItem = {
      id: "pr-2",
      title: "Project Deploy",
      body: "Deploy project now.",
      project_id: "proj-123",
      variables: [],
      created_at: 1000,
      updated_at: 1000,
      used_at: null,
    };

    const f = fakeSession({
      "/api/ext/projects": {
        projects: [{ id: "proj-123", name: "My Project", path: "/data/proj1", created_at: 1, updated_at: 1, file_count: 0, size_bytes: 0 }],
      },
    });
    sessionStore.setState({ session: f.session });

    const fetchMock = jest.fn(async (url: string) => {
      const isProject = url.includes("project=proj-123");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          prompts: isProject ? [projectPrompt, globalPrompt] : [globalPrompt],
        }),
      } as Response;
    });
    global.fetch = fetchMock as never;

    // 1. Chat with no project requests global list
    chatsStore.setState({
      chats: [{ key: "chat-global", workspaceScope: null } as never],
    });

    const { unmount } = await wrap(
      <PromptPickerSheet open={true} onClose={jest.fn()} chatKey="chat-global" />,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/prompts",
      expect.objectContaining({ method: "GET" }),
    );
    expect(screen.getByText("Global Review")).toBeTruthy();
    // Only the first line of the body is shown
    expect(screen.getByText("Please review this code.")).toBeTruthy();
    expect(screen.queryByText(/Second line hidden/)).toBeNull();
    expect(screen.queryByText("Project Deploy")).toBeNull();

    await act(async () => {
      unmount();
    });
    fetchMock.mockClear();

    // 2. Chat with project path when projectsStore is NOT loaded yet -> refreshes projectsStore first, then requests ?project=proj-123
    projectsStore.getState().reset();
    expect(projectsStore.getState().projects).toEqual([]);

    chatsStore.setState({
      chats: [
        {
          key: "chat-project",
          workspaceScope: { project_path: "/data/proj1" },
        } as never,
      ],
    });

    await wrap(
      <PromptPickerSheet open={true} onClose={jest.fn()} chatKey="chat-project" />,
    );

    expect(f.get).toHaveBeenCalledWith("/api/ext/projects");
    expect(projectsStore.getState().projects.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/prompts?project=proj-123",
      expect.objectContaining({ method: "GET" }),
    );
    expect(screen.getByText("Project Deploy")).toBeTruthy();
    expect(screen.getByText("Global Review")).toBeTruthy();
    // Project badge is shown
    expect(screen.getAllByText(/project|progetto/i).length).toBeGreaterThan(1);
  });

  test("search filters the list and shows prompts.noMatches when nothing matches", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const prompts: PromptItem[] = [
      {
        id: "pr-1",
        title: "Code Review",
        body: "Look for memory leaks.",
        project_id: null,
        variables: [],
        created_at: 1000,
        updated_at: 1000,
        used_at: null,
      },
      {
        id: "pr-2",
        title: "Database Query",
        body: "Optimize SQL joins.",
        project_id: null,
        variables: [],
        created_at: 1000,
        updated_at: 1000,
        used_at: null,
      },
    ];

    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ prompts }),
    } as Response));
    global.fetch = fetchMock as never;

    chatsStore.setState({
      chats: [{ key: "chat-1" } as never],
    });

    await wrap(<PromptPickerSheet open={true} onClose={jest.fn()} chatKey="chat-1" />);

    expect(screen.getByText("Code Review")).toBeTruthy();
    expect(screen.getByText("Database Query")).toBeTruthy();

    const searchInput = screen.getByPlaceholderText(/search|cerca/i);

    // Search by title
    await act(async () => {
      fireEvent.changeText(searchInput, "Code");
    });
    expect(screen.getByText("Code Review")).toBeTruthy();
    expect(screen.queryByText("Database Query")).toBeNull();

    // Search by body content
    await act(async () => {
      fireEvent.changeText(searchInput, "SQL joins");
    });
    expect(screen.queryByText("Code Review")).toBeNull();
    expect(screen.getByText("Database Query")).toBeTruthy();

    // Empty search result shows prompts.noMatches ("No prompts found"), not prompts.empty
    await act(async () => {
      fireEvent.changeText(searchInput, "nonexistent_xyz");
    });
    expect(screen.getByText("No prompts found")).toBeTruthy();
    expect(screen.queryByText("No saved prompts")).toBeNull();
  });

  test("picking with no variables appends to a non-empty draft after a blank line, and nothing is sent. Picking with variables fills them, and /used is posted", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const pNoVars: PromptItem = {
      id: "pr-novars",
      title: "Simple Greeting",
      body: "Hello world!",
      project_id: null,
      variables: [],
      created_at: 1000,
      updated_at: 1000,
      used_at: null,
    };

    const pWithVars: PromptItem = {
      id: "pr-vars",
      title: "Template Greeting",
      body: "Hello {{ recipient }}, regards from {{ sender }}.",
      project_id: null,
      variables: ["recipient", "sender"],
      created_at: 1000,
      updated_at: 1000,
      used_at: null,
    };

    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ prompts: [pNoVars, pWithVars] }),
      } as Response;
    });
    global.fetch = fetchMock as never;

    // Set initial non-empty draft in threadStore
    threadStore.getState().setDraft("chat-1", "Initial draft note.");
    const sendSpy = jest.spyOn(f.client, "sendMessage");

    // 1. Pick prompt with no variables
    const { unmount } = await wrap(
      <PromptPickerSheet open={true} onClose={jest.fn()} chatKey="chat-1" />,
    );

    const noVarItem = screen.getByText("Simple Greeting");
    await act(async () => {
      fireEvent.press(noVarItem);
    });

    // Appended after blank line
    expect(threadStore.getState().threads["chat-1"]?.draft).toBe(
      "Initial draft note.\n\nHello world!",
    );

    // Never sends automatically
    expect(sendSpy).not.toHaveBeenCalled();

    // markUsed was posted
    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/prompts/used",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "pr-novars" }),
      }),
    );

    await act(async () => {
      unmount();
    });
    fetchMock.mockClear();

    // 2. Pick prompt with variables
    threadStore.getState().setDraft("chat-1", "");

    await wrap(<PromptPickerSheet open={true} onClose={jest.fn()} chatKey="chat-1" />);

    const varItem = screen.getByText("Template Greeting");
    await act(async () => {
      fireEvent.press(varItem);
    });

    // Input fields for each variable appear
    const recipientInput = screen.getByLabelText("recipient");
    const senderInput = screen.getByLabelText("sender");
    const insertBtn = screen.getByRole("button", { name: /insert|inserisci/i });

    await act(async () => {
      fireEvent.changeText(recipientInput, "Bob");
      fireEvent.changeText(senderInput, "Alice");
      fireEvent.press(insertBtn);
    });

    expect(threadStore.getState().threads["chat-1"]?.draft).toBe(
      "Hello Bob, regards from Alice.",
    );

    // markUsed posted for pWithVars
    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/prompts/used",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "pr-vars" }),
      }),
    );
  });

  test("'Salva bozza come prompt' is disabled when draft is empty and prefills the body when non-empty", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ prompts: [] }),
    } as Response));
    global.fetch = fetchMock as never;

    // 1. Empty draft -> button is rendered and disabled
    threadStore.getState().setDraft("chat-1", "   ");

    const { unmount } = await wrap(
      <PromptPickerSheet open={true} onClose={jest.fn()} chatKey="chat-1" />,
    );

    const disabledSaveDraftBtn = screen.getByRole("button", {
      name: /salva bozza come prompt|save draft as prompt/i,
    });
    expect(disabledSaveDraftBtn.props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      unmount();
    });

    // 2. Non-empty draft -> button is enabled and prefills editor body
    threadStore.getState().setDraft("chat-1", "This is my active draft.");

    await wrap(<PromptPickerSheet open={true} onClose={jest.fn()} chatKey="chat-1" />);

    const saveDraftBtn = screen.getByRole("button", {
      name: /salva bozza come prompt|save draft as prompt/i,
    });
    expect(saveDraftBtn.props.accessibilityState?.disabled).toBeFalsy();

    await act(async () => {
      fireEvent.press(saveDraftBtn);
    });

    // Editor opens with prefilled body
    expect(screen.getByDisplayValue("This is my active draft.")).toBeTruthy();
  });

  test("the editor shows the detected variables live, preserves untrimmed body and existing project_id, refreshes once on save/delete, and delete asks for confirm", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            prompt: {
              id: "new-p1",
              title: "My Prompt",
              body: "  Check {{ file }} for {{ pattern }} issues.\n",
              project_id: "proj-1",
              variables: ["file", "pattern"],
              created_at: 1000,
              updated_at: 1000,
              used_at: null,
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ prompts: [] }),
      } as Response;
    });
    global.fetch = fetchMock as never;

    // 1. Create prompt in project scope (untrimmed body preserved, single refresh)
    const { unmount } = await wrap(
      <PromptEditorSheet
        open={true}
        onClose={jest.fn()}
        projectId="proj-1"
      />,
    );

    const titleInput = screen.getByLabelText(/title|titolo/i);
    const bodyInput = screen.getByLabelText(/prompt body|testo del prompt/i);
    const scopeSwitch = screen.getByRole("switch");

    await act(async () => {
      fireEvent.changeText(titleInput, "Refactor Helper");
      fireEvent.changeText(bodyInput, "  Check {{ file }} for {{ pattern }} issues.\n");
    });

    // Detected variables displayed live
    expect(screen.getByText("file")).toBeTruthy();
    expect(screen.getByText("pattern")).toBeTruthy();

    // Toggle scope switch on
    await act(async () => {
      fireEvent(scopeSwitch, "valueChange", true);
    });

    fetchMock.mockClear();

    const saveBtn = screen.getByRole("button", { name: /^save$|^salva$/i });
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/prompts/save",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Refactor Helper",
          body: "  Check {{ file }} for {{ pattern }} issues.\n",
          project_id: "proj-1",
        }),
      }),
    );
    // Only 1 GET refresh after save
    const getCallsAfterSave = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === "GET",
    );
    expect(getCallsAfterSave.length).toBe(1);

    await act(async () => {
      unmount();
    });
    fetchMock.mockClear();

    // 2. Edit existing project-scoped prompt without passing projectId prop -> keeps its project_id unless switch toggled
    const existingProjectPrompt: PromptItem = {
      id: "p-existing",
      title: "Old Prompt",
      body: "Old body",
      project_id: "proj-keep",
      variables: [],
      created_at: 1000,
      updated_at: 1000,
      used_at: null,
    };

    await wrap(
      <PromptEditorSheet
        open={true}
        onClose={jest.fn()}
        prompt={existingProjectPrompt}
      />,
    );

    // Switch is rendered and ON because prompt.project_id is "proj-keep"
    expect(screen.getByRole("switch").props.value).toBe(true);

    const saveBtnExisting = screen.getByRole("button", { name: /^save$|^salva$/i });
    await act(async () => {
      fireEvent.press(saveBtnExisting);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/prompts/save",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          id: "p-existing",
          title: "Old Prompt",
          body: "Old body",
          project_id: "proj-keep",
        }),
      }),
    );

    fetchMock.mockClear();

    // Now test delete with confirmation dialog
    const deleteBtn = screen.getByRole("button", { name: /^delete$|^elimina$/i });
    await act(async () => {
      fireEvent.press(deleteBtn);
    });

    // Confirmation dialog appears
    expect(screen.getByText(/elimina prompt\?|delete prompt\?/i)).toBeTruthy();
    expect(screen.getByText(/Old Prompt/)).toBeTruthy();

    const dialogCard = screen.getByText(/elimina prompt\?|delete prompt\?/i).parent!;
    const confirmDeleteBtn = within(dialogCard).getByRole("button", { name: /^delete$|^elimina$/i });
    await act(async () => {
      fireEvent.press(confirmDeleteBtn);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/prompts/delete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "p-existing" }),
      }),
    );
  });

  test("a 409 shows prompts.tooMany. A network error shows common.operationFailed", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    // 1. 409 Too Many
    let fetchMock = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "too_many_prompts" }),
    } as Response));
    global.fetch = fetchMock as never;

    const { unmount } = await wrap(
      <PromptEditorSheet open={true} onClose={jest.fn()} />,
    );

    const titleInput = screen.getByLabelText(/title|titolo/i);
    const bodyInput = screen.getByLabelText(/prompt body|testo del prompt/i);

    await act(async () => {
      fireEvent.changeText(titleInput, "Test");
      fireEvent.changeText(bodyInput, "Test body");
    });
    const saveBtn = screen.getByRole("button", { name: /^save$|^salva$/i });
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(toast.show).toHaveBeenCalledWith(
      expect.stringMatching(/limit reached|massimo 500/i),
    );

    await act(async () => {
      unmount();
    });
    (toast.show as jest.Mock).mockClear();

    // 2. Network error
    fetchMock = jest.fn(async () => {
      throw new Error("Network offline");
    });
    global.fetch = fetchMock as never;

    await wrap(<PromptEditorSheet open={true} onClose={jest.fn()} />);

    const titleInput2 = screen.getByLabelText(/title|titolo/i);
    const bodyInput2 = screen.getByLabelText(/prompt body|testo del prompt/i);

    await act(async () => {
      fireEvent.changeText(titleInput2, "Test");
      fireEvent.changeText(bodyInput2, "Test body");
    });
    const saveBtn2 = screen.getByRole("button", { name: /^save$|^salva$/i });
    await act(async () => {
      fireEvent.press(saveBtn2);
    });

    // Never shows raw "Network offline"
    expect(toast.show).toHaveBeenCalledWith(
      expect.stringMatching(/failed|non riuscita/i),
    );
    expect(toast.show).not.toHaveBeenCalledWith(
      expect.stringContaining("Network offline"),
    );
  });

  test("the settings section shows only global prompts. The project section shows only that project's", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const globalPrompt: PromptItem = {
      id: "p-glob",
      title: "Global Workflow",
      body: "Global body text",
      project_id: null,
      variables: [],
      created_at: 1000,
      updated_at: 1000,
      used_at: null,
    };

    const projectPrompt: PromptItem = {
      id: "p-proj",
      title: "Project Workflow",
      body: "Project body text",
      project_id: "proj-abc",
      variables: [],
      created_at: 1000,
      updated_at: 1000,
      used_at: null,
    };

    const fetchMock = jest.fn(async (url: string) => {
      const isProject = url.includes("project=proj-abc");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          prompts: isProject ? [projectPrompt, globalPrompt] : [globalPrompt],
        }),
      } as Response;
    });
    global.fetch = fetchMock as never;

    // 1. Settings section
    const { unmount } = await wrap(<PromptsSection />);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://h/api/ext/prompts",
      expect.objectContaining({ method: "GET" }),
    );
    expect(screen.getByText("Global Workflow")).toBeTruthy();
    expect(screen.queryByText("Project Workflow")).toBeNull();

    await act(async () => {
      unmount();
    });
    fetchMock.mockClear();

    // 2. ProjectDetailScreen section
    const projDetailSession = fakeSession({
      "/api/ext/projects/proj-abc": {
        project: { id: "proj-abc", name: "Project ABC", path: "/path/abc" },
        files: [],
        instructions: "",
        truncated: false,
      },
    });
    sessionStore.setState({ session: projDetailSession.session });

    await wrap(<ProjectDetailScreen id="proj-abc" />);

    // In project detail, only that project's prompts are listed; global prompt is absent
    expect(screen.getByText("Project Workflow")).toBeTruthy();
    expect(screen.queryByText("Global Workflow")).toBeNull();
  });

  test("a profile switch mid-request drops the stale result via the profileId guard", async () => {
    let resolveRequest: ((v: any) => void) | null = null;
    const fetchMock = jest.fn(() => {
      return new Promise((res) => {
        resolveRequest = () =>
          res({
            ok: true,
            status: 200,
            json: async () => ({
              prompts: [
                {
                  id: "stale-p",
                  title: "Stale Prompt",
                  body: "Stale body",
                  project_id: null,
                  variables: [],
                  created_at: 1000,
                  updated_at: 1000,
                  used_at: null,
                },
              ],
            }),
          });
      });
    });
    global.fetch = fetchMock as never;

    const f = fakeSession();
    sessionStore.setState({
      session: f.session,
      profile: { id: "profile-1", baseUrl: "http://h", name: "P1" } as never,
    });

    const refreshPromise = promptsStore.getState().refresh();

    // Bypass reset() subscription so that generation is NOT incremented,
    // specifically exercising the `if (profileId !== currentProfileId) return;` guard in refresh()
    const resetSpy = jest
      .spyOn(promptsStore.getState(), "reset")
      .mockImplementation(() => {});

    sessionStore.setState({
      profile: { id: "profile-2", baseUrl: "http://h2", name: "P2" } as never,
    });

    resetSpy.mockRestore();

    // Stale request resolves
    await act(async () => {
      resolveRequest?.(null);
      await refreshPromise;
    });

    // Data was dropped by the profileId guard
    expect(promptsStore.getState().prompts).toEqual([]);
  });

  test("prompts from other projects do not leak into global picker (resolvedProjectId == null)", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session, state: "open" as never });
    const promptList = [
      { id: "p-global", project_id: null, title: "Global Prompt", body: "Hello", variables: [], created_at: 1, updated_at: 1, used_at: null },
      { id: "p-other", project_id: "other-project", title: "Other Project Prompt", body: "Secret", variables: [], created_at: 2, updated_at: 2, used_at: null },
    ];
    // Seed promptsStore with project A's prompts before the fetch
    promptsStore.setState({ prompts: promptList });
    // Make the fetch never resolve
    global.fetch = jest.fn(() => new Promise(() => {})) as never;

    await wrap(
      <PromptPickerSheet
        open={true}
        onClose={jest.fn()}
        chatKey="webui:global"
        projectId={null}
      />,
    );

    expect(screen.getByText("Global Prompt")).toBeTruthy();
    expect(screen.queryByText("Other Project Prompt")).toBeNull();
  });

  test("PromptEditorSheet enforces maxLength on title (120) and body (20000), and shows prompts.tooLong on invalid_title error", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session });

    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_title" }),
    } as Response));
    global.fetch = fetchMock as never;

    await wrap(<PromptEditorSheet open={true} onClose={jest.fn()} />);

    const titleInput = screen.getByLabelText(/title|titolo/i);
    const bodyInput = screen.getByLabelText(/prompt body|testo del prompt/i);

    expect(titleInput.props.maxLength).toBe(120);
    expect(bodyInput.props.maxLength).toBe(20000);

    await act(async () => {
      fireEvent.changeText(titleInput, "Valid Title");
      fireEvent.changeText(bodyInput, "Valid Body");
    });

    const saveBtn = screen.getByRole("button", { name: /^save$|^salva$/i });
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(toast.show).toHaveBeenCalledWith(i18n.t("prompts.tooLong"));
  });

  test("PromptPickerSheet trims search query trailing whitespace", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session, state: "open" as never });
    const promptList = [
      { id: "p1", title: "Review Code", body: "Review body", variables: [], created_at: 1, updated_at: 1 },
    ];
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ prompts: promptList }),
    } as Response)) as never;

    await wrap(<PromptPickerSheet open={true} onClose={jest.fn()} projectId={null} />);

    const searchInput = screen.getByPlaceholderText(i18n.t("prompts.search"));
    await act(async () => {
      fireEvent.changeText(searchInput, "Review   ");
    });

    // Still matches because search is trimmed
    expect(screen.getByText("Review Code")).toBeTruthy();
  });

  test("PromptPickerSheet shows prompts.empty when library is empty, even when search query is typed", async () => {
    const f = fakeSession();
    sessionStore.setState({ session: f.session, state: "open" as never });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ prompts: [] }),
    } as Response)) as never;

    await wrap(<PromptPickerSheet open={true} onClose={jest.fn()} projectId={null} />);

    const searchInput = screen.getByPlaceholderText(i18n.t("prompts.search"));
    await act(async () => {
      fireEvent.changeText(searchInput, "anything");
    });

    expect(screen.getByText(i18n.t("prompts.empty"))).toBeTruthy();
    expect(screen.queryByText(i18n.t("prompts.noMatches"))).toBeNull();
  });
});

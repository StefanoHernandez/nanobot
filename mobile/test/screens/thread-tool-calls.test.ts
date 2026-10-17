import type { UIMessage } from "@/lib/types";
import {
  extractMainArg,
  formatRowDescription,
  formatToolDescription,
  toolCallsOf,
  toolIcon,
} from "../../src/screens/thread/toolCalls";

describe("toolCallsOf helper", () => {
  test("start and end are paired", () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            phase: "start",
            call_id: "call-123",
            name: "read_file",
            arguments: { path: "src/index.ts" },
          },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        kind: "trace",
        createdAt: 2000,
        content: "",
        toolEvents: [
          {
            phase: "end",
            call_id: "call-123",
            name: "read_file",
            result: "console.log('hello');",
          },
        ],
      },
    ];

    const calls = toolCallsOf(messages);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("call-123");
    expect(calls[0].name).toBe("read_file");
    expect(calls[0].status).toBe("completed");
    expect(calls[0].args).toEqual({ path: "src/index.ts" });
    expect(calls[0].result).toBe("console.log('hello');");
  });

  test("an error gives the error status", () => {
    const messagesWithPhaseError: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            phase: "error",
            call_id: "c-err1",
            name: "exec",
            arguments: { command: "cat nonexistent" },
            error: "File not found",
          },
        ],
      },
    ];

    const calls1 = toolCallsOf(messagesWithPhaseError);
    expect(calls1).toHaveLength(1);
    expect(calls1[0].status).toBe("error");
    expect(calls1[0].error).toBe("File not found");

    // Also verify when start is followed by an error event
    const messagesWithStartThenError: UIMessage[] = [
      {
        id: "m2",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          { phase: "start", call_id: "c-err2", name: "exec", arguments: { command: "fail" } },
          { phase: "end", call_id: "c-err2", error: "Command exited with 1" },
        ],
      },
    ];
    const calls2 = toolCallsOf(messagesWithStartThenError);
    expect(calls2).toHaveLength(1);
    expect(calls2[0].status).toBe("error");
    expect(calls2[0].error).toBe("Command exited with 1");
  });

  test("the description comes from the hint, or from name plus argument", () => {
    // 1. With explicit hint on event
    const withEventHint: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c1",
            name: "exec",
            arguments: { command: "npm test" },
            // @ts-expect-error test custom hint property
            hint: "Eseguo i test del modulo",
          },
        ],
      },
    ];
    const calls1 = toolCallsOf(withEventHint);
    expect(calls1[0].hint).toBe("Eseguo i test del modulo");
    expect(calls1[0].description).toBe("Eseguo i test del modulo");

    // 2. With trace line on message
    const withTraceLine: UIMessage[] = [
      {
        id: "m2",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        traces: ["Lettura del file di configurazione"],
        toolEvents: [
          {
            call_id: "c2",
            name: "read_file",
            arguments: { path: "config.json" },
          },
        ],
      },
    ];
    const calls2 = toolCallsOf(withTraceLine);
    expect(calls2[0].hint).toBe("Lettura del file di configurazione");

    // 3. Fallback to name plus argument: command
    const execCall: UIMessage[] = [
      {
        id: "m3",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c3",
            name: "exec",
            arguments: { command: "git status" },
          },
        ],
      },
    ];
    const calls3 = toolCallsOf(execCall);
    expect(calls3[0].hint).toBe("exec git status");
    expect(calls3[0].description).toBe("exec git status");

    // 4. Fallback to name plus argument: path
    const readFileCall: UIMessage[] = [
      {
        id: "m4",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c4",
            name: "read_file",
            arguments: { path: "package.json" },
          },
        ],
      },
    ];
    const calls4 = toolCallsOf(readFileCall);
    expect(calls4[0].hint).toBe("read_file package.json");

    // 5. Fallback to name plus argument: url
    const webCall: UIMessage[] = [
      {
        id: "m5",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c5",
            name: "fetch_web_page",
            arguments: { url: "https://example.com" },
          },
        ],
      },
    ];
    const calls5 = toolCallsOf(webCall);
    expect(calls5[0].hint).toBe("fetch_web_page https://example.com");

    // 6. Fallback to name plus argument: query
    const searchCall: UIMessage[] = [
      {
        id: "m6",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c6",
            name: "search",
            arguments: { query: "react hooks" },
          },
        ],
      },
    ];
    const calls6 = toolCallsOf(searchCall);
    expect(calls6[0].hint).toBe("search react hooks");

    // 7. Fallback to first string argument if no standard key
    const customCall: UIMessage[] = [
      {
        id: "m7",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c7",
            name: "custom_tool",
            arguments: { foo: 42, customTarget: "target-val" },
          },
        ],
      },
    ];
    const calls7 = toolCallsOf(customCall);
    expect(calls7[0].hint).toBe("custom_tool target-val");

    // 8. Tool with no arguments
    const noArgsCall: UIMessage[] = [
      {
        id: "m8",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c8",
            name: "kanban",
          },
        ],
      },
    ];
    const calls8 = toolCallsOf(noArgsCall);
    expect(calls8[0].hint).toBe("kanban");
  });

  test("calls without an id stay separate", () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          { name: "exec", arguments: { command: "pwd" } },
          { name: "exec", arguments: { command: "ls" } },
        ],
      },
    ];

    const calls = toolCallsOf(messages);
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe("exec");
    expect(calls[0].hint).toBe("exec pwd");
    expect(calls[1].name).toBe("exec");
    expect(calls[1].hint).toBe("exec ls");
    expect(calls[0].id).not.toBe(calls[1].id);
  });

  test("toolIcon maps categories per brief", () => {
    expect(toolIcon("exec")).toBe("console");
    expect(toolIcon("exec_shell")).toBe("console");
    expect(toolIcon("bash")).toBe("console");

    expect(toolIcon("write_file")).toBe("pencil");
    expect(toolIcon("edit_file")).toBe("pencil");
    expect(toolIcon("apply_patch")).toBe("pencil");

    expect(toolIcon("read_file")).toBe("file-document-outline");
    expect(toolIcon("view_file")).toBe("file-document-outline");

    expect(toolIcon("web_search")).toBe("magnify");
    expect(toolIcon("search")).toBe("magnify");
    expect(toolIcon("grep")).toBe("magnify");

    expect(toolIcon("browser")).toBe("web");
    expect(toolIcon("fetch_url")).toBe("web");

    expect(toolIcon("kanban")).toBe("view-column");
    expect(toolIcon("todo")).toBe("view-column");

    expect(toolIcon("unknown_tool")).toBe("wrench");
  });

  test("formatRowDescription ensures ellipsis at the end", () => {
    expect(formatRowDescription("exec git status")).toBe("exec git status…");
    expect(formatRowDescription("exec git status…")).toBe("exec git status…");
    expect(formatRowDescription("exec git status...")).toBe("exec git status...");
  });

  test("extractMainArg handles JSON strings and objects", () => {
    expect(extractMainArg('{"command":"ls -la"}')).toBe("ls -la");
    expect(extractMainArg({ path: "README.md" })).toBe("README.md");
    expect(extractMainArg("plain text arg")).toBe("plain text arg");
    expect(extractMainArg(null)).toBeNull();
  });
});

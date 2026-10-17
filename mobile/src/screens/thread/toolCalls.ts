import type { ToolProgressEvent, UIFileEdit, UIMessage } from "@/lib/types";

export type ToolCallStatus = "running" | "completed" | "error";

export type ToolCall = {
  id: string;
  name: string;
  status: ToolCallStatus;
  hint: string;
  args: unknown;
  result?: unknown;
  error?: unknown;
  detailRef?: string;
  fileEdits?: UIFileEdit[];
  description?: string;
};

/** Extract main argument string: command, path, url, query, or first string value. */
export function extractMainArg(args: unknown): string | null {
  if (args == null) return null;
  if (typeof args === "string") {
    const trimmed = args.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return extractMainArg(parsed);
      }
    } catch {
      // Not JSON, return trimmed string
    }
    return trimmed;
  }
  if (typeof args === "object") {
    const obj = args as Record<string, unknown>;
    for (const key of ["command", "path", "url", "query"]) {
      const val = obj[key];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    for (const val of Object.values(obj)) {
      if (typeof val === "string" && val.trim()) return val.trim();
    }
  }
  return null;
}

/** Compute the description: hint line if available, otherwise name + main argument. */
export function formatToolDescription(name: string, hint?: string | null, args?: unknown): string {
  if (hint && hint.trim()) {
    return hint.trim();
  }
  const mainArg = extractMainArg(args);
  if (mainArg) {
    return `${name} ${mainArg}`;
  }
  return name;
}

/** Description formatted for single-line display ending with "…". */
export function formatRowDescription(desc: string): string {
  const trimmed = desc.trim();
  if (trimmed.endsWith("…") || trimmed.endsWith("...")) {
    return trimmed;
  }
  return `${trimmed}…`;
}

/** Map tool name to MaterialCommunityIcons icon name per TL-A brief. */
export function toolIcon(name: string): "console" | "pencil" | "file-document-outline" | "web" | "magnify" | "view-column" | "wrench" {
  const n = name.toLowerCase();
  if (
    n.includes("exec") ||
    n.includes("shell") ||
    n.includes("bash") ||
    n.includes("command") ||
    n.includes("terminal") ||
    n === "sh"
  ) {
    return "console";
  }
  if (
    n.includes("write") ||
    n.includes("edit") ||
    n.includes("patch") ||
    n.includes("pencil")
  ) {
    return "pencil";
  }
  if (
    n.includes("search") ||
    n.includes("grep") ||
    n.includes("find") ||
    n.includes("magnify")
  ) {
    return "magnify";
  }
  if (
    n.includes("web") ||
    n.includes("browser") ||
    n.includes("url") ||
    n.includes("http") ||
    n.includes("curl")
  ) {
    return "web";
  }
  if (
    n.includes("read") ||
    n.includes("file") ||
    n.includes("view") ||
    n.includes("dir")
  ) {
    return "file-document-outline";
  }
  if (
    n.includes("kanban") ||
    n.includes("board") ||
    n.includes("todo") ||
    n.includes("task")
  ) {
    return "view-column";
  }
  return "wrench";
}

/** Pure helper to extract structured tool calls from activity messages. */
export function toolCallsOf(messages: UIMessage[]): ToolCall[] {
  const editsByCallId = new Map<string, UIFileEdit[]>();
  for (const m of messages) {
    if (m.fileEdits) {
      for (const edit of m.fileEdits) {
        if (!edit.call_id) continue;
        const list = editsByCallId.get(edit.call_id) ?? [];
        list.push(edit);
        editsByCallId.set(edit.call_id, list);
      }
    }
  }

  const calls: ToolCall[] = [];
  const callIndexById = new Map<string, number>();
  let anonymousCounter = 1;

  for (const m of messages) {
    const messageDetailRef = m.traceDetail?.ref;
    const events = m.toolEvents;

    if (events && events.length > 0) {
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const rawCallId = ev.call_id;
        const evName =
          ev.name ??
          (ev as { function?: { name?: unknown } }).function?.name?.toString() ??
          "";
        const evArgs =
          ev.arguments ??
          (ev as { function?: { arguments?: unknown } }).function?.arguments;

        let rawHint: string | undefined =
          (ev as { hint?: string }).hint ??
          (ev as { text?: string }).text ??
          (ev as { description?: string }).description;
        if (!rawHint && m.traces && m.traces.length > i && events.length === m.traces.length) {
          rawHint = m.traces[i];
        } else if (!rawHint && m.traces && m.traces.length === 1 && events.length === 1) {
          rawHint = m.traces[0];
        }

        if (rawCallId) {
          const existingIdx = callIndexById.get(rawCallId);
          if (existingIdx !== undefined) {
            const existing = calls[existingIdx];
            if (!existing.name && evName) existing.name = evName;
            if (evArgs !== undefined && existing.args === undefined) existing.args = evArgs;
            if (ev.result !== undefined) existing.result = ev.result;
            if (ev.error !== undefined) existing.error = ev.error;
            if (messageDetailRef && !existing.detailRef) existing.detailRef = messageDetailRef;
            if (!existing.fileEdits && editsByCallId.has(rawCallId)) {
              existing.fileEdits = editsByCallId.get(rawCallId);
            }

            if (ev.phase === "error" || ev.error != null) {
              existing.status = "error";
            } else if (ev.phase === "end" || ev.result !== undefined) {
              if (existing.status !== "error") {
                existing.status = "completed";
              }
            } else if (ev.phase === "start") {
              if (existing.status !== "error" && existing.status !== "completed") {
                existing.status = "running";
              }
            }

            if (rawHint) {
              existing.hint = rawHint;
              existing.description = rawHint;
            } else if (existing.args !== undefined) {
              const updatedDesc = formatToolDescription(existing.name, null, existing.args);
              existing.hint = updatedDesc;
              existing.description = updatedDesc;
            }
          } else {
            const status: ToolCallStatus =
              ev.phase === "error" || ev.error != null
                ? "error"
                : ev.phase === "end" || ev.result !== undefined
                  ? "completed"
                  : ev.phase === "start"
                    ? "running"
                    : "completed";

            const desc = formatToolDescription(evName, rawHint, evArgs);
            const call: ToolCall = {
              id: rawCallId,
              name: evName,
              status,
              hint: desc,
              description: desc,
              args: evArgs,
              result: ev.result,
              error: ev.error,
              detailRef: messageDetailRef,
              fileEdits: editsByCallId.get(rawCallId),
            };
            callIndexById.set(rawCallId, calls.length);
            calls.push(call);
          }
        } else {
          const status: ToolCallStatus =
            ev.phase === "error" || ev.error != null
              ? "error"
              : ev.phase === "end" || ev.result !== undefined
                ? "completed"
                : ev.phase === "start"
                  ? "running"
                  : "completed";

          const id = `anon_${anonymousCounter++}`;
          const desc = formatToolDescription(evName, rawHint, evArgs);
          const call: ToolCall = {
            id,
            name: evName,
            status,
            hint: desc,
            description: desc,
            args: evArgs,
            result: ev.result,
            error: ev.error,
            detailRef: messageDetailRef,
          };
          calls.push(call);
        }
      }
    }
  }

  // Cover any fileEdits that didn't have an explicit toolEvent
  for (const [callId, edits] of editsByCallId.entries()) {
    if (!callIndexById.has(callId)) {
      const firstEdit = edits[0];
      const status: ToolCallStatus =
        firstEdit.status === "error"
          ? "error"
          : firstEdit.status === "editing"
            ? "running"
            : "completed";
      const name = firstEdit.tool || "file_edit";
      const args = { path: firstEdit.path };
      const desc = formatToolDescription(name, null, args);
      calls.push({
        id: callId,
        name,
        status,
        hint: desc,
        description: desc,
        args,
        error: firstEdit.error,
        fileEdits: edits,
      });
      callIndexById.set(callId, calls.length - 1);
    }
  }

  // If no structured events were present, fallback to parsing trace lines
  if (calls.length === 0) {
    for (const m of messages) {
      if (m.kind === "trace") {
        const lines = m.traces?.length ? m.traces : m.content?.trim() ? [m.content] : [];
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const match = /^([a-zA-Z0-9_.-]+)\((.*)\)$/.exec(trimmed);
          const name = match ? match[1] : trimmed.split(" ")[0];
          const args = match ? match[2] : undefined;
          calls.push({
            id: `trace_${anonymousCounter++}`,
            name,
            status: "completed",
            hint: trimmed,
            description: trimmed,
            args,
            detailRef: m.traceDetail?.ref,
          });
        }
      }
    }
  }

  return calls;
}

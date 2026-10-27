import { useCallback, useEffect, useMemo, useRef } from "react";
import { createStore, useStore } from "zustand";
import { shallow } from "zustand/shallow";
import { parseWebuiThreadPayload } from "@/lib/api";
import {
  clearThreadProjectionActivity,
  createThreadProjectionState,
  finalizeStreamedTurn,
  projectThreadEvent,
  projectThreadEvents,
  resetThreadProjectionCursor,
  type ThreadProjectionState,
} from "@/lib/thread-event-projection";
import { toMediaAttachment } from "@/lib/media";
import type { InboundEvent, SessionMention, ThreadProjectionEvent, UIMessage } from "@/lib/types";
import type { NanobotSession } from "../core/session";
import { prepareImage, uploadFiles, validateFiles, type LocalFile } from "../core/upload";
import { chatIdOf, chatsStore, isWritable } from "./chatsStore";
import { sessionStore, useSession } from "./sessionStore";
import { subagentsStore } from "./subagentsStore";
import { isStaleThreadSnapshot } from "./staleSnapshot";
import { workspaceStore } from "./workspace";
import { latestContextUsage } from "./usage";
import { toast } from "../ui/components/Toast";
import { i18n } from "../i18n";

export type Notice = { kind: "compaction" | "recovery" | "fallback" | "stream_error" | "retry"; text: string };

export type ThreadSlice = {
  messages: UIMessage[];
  running: boolean;
  model: string | null;
  preset: string | null;
  notices: Notice[];
  draft: string;
  loaded: boolean;
  /** True after a local Stop until the next send; read by notifications to stay silent. */
  stopped: boolean;
  /** Last send/upload failure code (e.g. "upload_unavailable", "count"); cleared by the next send. UI maps it to i18n. */
  sendError: string | null;
  /** True while a file send is in its upload phase; send() is refused meanwhile. */
  uploading: boolean;
  /** True while a (re)hydrate fetch is in flight; the outbox waits for it before sending. */
  hydrating?: boolean;
  /** Last history fetch failed (network, or a server/app protocol mismatch). The UI offers Retry. */
  loadError?: boolean;
  /** Composer attachment chips, kept here so share and navigation preserve them. Cleared after a successful send. */
  pendingFiles: LocalFile[];
  /** Message count before the fork point (draw the "forked from here" divider after it), else null. */
  forkBoundary: number | null;
  /** Connection-owned chat: no history, no draft persistence, no workspace/subagents. */
  temporary: boolean;
  hasMoreBefore?: boolean;
  loadingOlder?: boolean;
  beforeCursor?: string | null;
  queuedMessages?: QueuedMessage[];
  replyingTo?: UIMessage | null;
};

export type QueuedMessage = {
  id: string;
  text: string;
  opts?: SendOpts;
};

type SendFrameOpts = NonNullable<Parameters<NanobotSession["client"]["sendMessage"]>[3]>;
export type SendOpts = {
  files?: LocalFile[];
  cliApps?: SendFrameOpts["cliApps"];
  mcpPresets?: SendFrameOpts["mcpPresets"];
  sessionMentions?: SessionMention[];
  workspaceScope?: SendFrameOpts["workspaceScope"];
  steer?: boolean;
};

type S = {
  threads: Record<string, ThreadSlice>;
  load(session: NanobotSession, key: string): Promise<void>;
  unload(key: string): void;
  loadOlder(key: string, session?: NanobotSession): Promise<void>;
  /** Leaving a chat: a temporary one is discarded on the server and forgotten locally (exactly once). */
  leave(session: NanobotSession, key: string): void;
  /** Deferred leave for effect cleanup: a quick remount (StrictMode, fast refresh) of the same key cancels it. */
  scheduleLeave(session: NanobotSession, key: string): void;
  /** Unloads every runtime and drops all threads (profile switch). */
  reset(): void;
  /** Returns true when the send started. With opts.files the upload is async: failures set sendError and mark the row failed; the draft and pendingFiles are cleared only on success. */
  send(session: NanobotSession, key: string, text: string, opts?: SendOpts): boolean;
  sendQueuedNow(session: NanobotSession, key: string, id: string): void;
  modifyQueued(key: string, id: string): void;
  removeQueued(key: string, id: string): void;
  setReplyingTo(key: string, message: UIMessage | null): void;
  setPendingFiles(key: string, files: LocalFile[]): void;
  stop(session: NanobotSession, key: string): void;
  setDraft(key: string, text: string): void;
  clearSendError(key: string): void;
  cancelLeave(key: string): void;
};

const EMPTY: ThreadSlice = { messages: [], running: false, model: null, preset: null, notices: [], draft: "", loaded: false, stopped: false, sendError: null, uploading: false, hydrating: false, pendingFiles: [], forkBoundary: null, temporary: false, hasMoreBefore: false, loadingOlder: false, beforeCursor: null, queuedMessages: [], replyingTo: null };
const LEAVE_DELAY_MS = 300;
const PROJECTED = new Set(["user_message", "message", "file_edit", "delta", "stream_end", "reasoning_delta", "reasoning_end", "turn_end", "context_compaction"]);
const threadPath = (key: string) => `/api/sessions/${encodeURIComponent(key)}/webui-thread`;

type Runtime = {
  proj: ThreadProjectionState;
  unsubs: (() => void)[];
  gen: number;
  /** Live events received while a history fetch is in flight; replayed after it. */
  buffer: InboundEvent[] | null;
  /** Id of the bubble that was still streaming when the run status last went null (drop/stop); else null. */
  reopenId: string | null;
  session: NanobotSession | null;
  loadedOnce: boolean;
  olderEvents: ThreadProjectionEvent[];
  newestEvents: ThreadProjectionEvent[];
  compactionBeforeTokens?: number;
};

export function createThreadStore() {
  const rts = new Map<string, Runtime>();
  const visitedChats: string[] = [];
  let ids = 0;
  const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const compactTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const cancelLeave = (key: string) => {
    clearTimeout(leaveTimers.get(key));
    leaveTimers.delete(key);
  };
  const rtOf = (key: string): Runtime => {
    let rt = rts.get(key);
    if (!rt) rts.set(key, (rt = { proj: createThreadProjectionState(), unsubs: [], gen: 0, buffer: null, reopenId: null, session: null, loadedOnce: false, olderEvents: [], newestEvents: [] }));
    return rt;
  };

  const eventKey = (ev: ThreadProjectionEvent): string => {
    if (ev.projection_id) return ev.projection_id;
    const anyEv = ev as unknown as Record<string, unknown>;
    if (anyEv.turn_id && anyEv.event) {
      return `${anyEv.event}:${anyEv.turn_id}:${anyEv.turn_seq ?? anyEv.text ?? anyEv.created_at_ms ?? ""}`;
    }
    return JSON.stringify(ev);
  };

  return createStore<S>((set, get) => {
    const patch = (key: string, fn: (s: ThreadSlice) => Partial<ThreadSlice>) =>
      set((st) => {
        const cur = st.threads[key] ?? EMPTY;
        return { threads: { ...st.threads, [key]: { ...cur, ...fn(cur) } } };
      });
    const notice = (list: Notice[], n: Notice | null, drop: Notice["kind"][]): Notice[] =>
      [...list.filter((x) => !drop.includes(x.kind)), ...(n ? [n] : [])];

    const project = (key: string, ev: ThreadProjectionEvent, sideChannel = false) => {
      const rt = rtOf(key);
      patch(key, (s) => {
        rt.proj = projectThreadEvent({ ...rt.proj, messages: s.messages }, ev, {
          createId: () => `live-${++ids}`,
          now: Date.now(),
          sideChannel,
        });
        return { messages: rt.proj.messages };
      });
    };

    // Same event semantics as WebUI useNanobotStream.handle (useNanobotStream.ts:511-1000), minus UI-only throttling.
    const apply = (key: string, ev: InboundEvent) => {
      const clearRetry = (s: ThreadSlice) => notice(s.notices, null, ["retry"]);
      switch (ev.event) {
        case "user_message":
          project(key, ev);
          if (ev.starts_turn || ev.active_turn_id) patch(key, () => ({ running: true }));
          return;
        case "delta":
        case "reasoning_delta":
          project(key, ev);
          patch(key, (s) => ({ running: true, notices: clearRetry(s) }));
          return;
        case "message":
        case "file_edit":
        case "stream_end":
          project(key, ev);
          patch(key, (s) => ({ notices: clearRetry(s) }));
          return;
        case "reasoning_end":
          project(key, ev);
          return;
        case "turn_end": {
          project(key, ev);
          rtOf(key).reopenId = null;
          const failed = ev.outcome === "failed";
          patch(key, (s) => ({
            running: false,
            messages: finalizeStreamedTurn(s.messages),
            notices: notice(s.notices, failed ? { kind: "stream_error", text: ev.failure_message || "This turn failed and has ended." } : null, ["retry"]),
          }));
          rtOf(key).proj = resetThreadProjectionCursor(rtOf(key).proj, get().threads[key].messages);

          const queue = get().threads[key]?.queuedMessages ?? [];
          if (queue.length > 0) {
            const [first, ...rest] = queue;
            patch(key, () => ({ queuedMessages: rest }));
            const s = rtOf(key).session ?? sessionStore.getState().session;
            if (s) {
              get().send(s, key, first.text, first.opts);
            }
          }
          return;
        }
        case "context_compaction": {
          clearTimeout(compactTimers.get(key));
          compactTimers.delete(key);
          const curMsgs = (get().threads[key] ?? EMPTY).messages;
          const currentBeforeTokens = latestContextUsage(curMsgs)?.contextTokens;
          project(key, ev);
          if (ev.phase === "started") {
            rtOf(key).compactionBeforeTokens = currentBeforeTokens;
            patch(key, (s) => ({
              notices: notice(s.notices, { kind: "compaction", text: i18n.t("thread.compaction.started", { defaultValue: "Compattazione in corso…" }) }, ["compaction"]),
            }));
          } else {
            const beforeTokens = rtOf(key).compactionBeforeTokens ?? currentBeforeTokens;
            rtOf(key).compactionBeforeTokens = undefined;
            patch(key, (s) => ({ notices: notice(s.notices, null, ["compaction"]) }));
            if (ev.phase === "succeeded") {
              const compId = `compaction-${ev.compaction_id}`;
              const s = rtOf(key).session ?? sessionStore.getState().session;
              if (s) {
                void (async () => {
                  try {
                    const ctx = await s.get<{ estimated_session_tokens?: number }>(`/api/sessions/${encodeURIComponent(key)}/context`);
                    const afterTokens = ctx?.estimated_session_tokens;
                    if (typeof afterTokens === "number") {
                      patch(key, (st) => ({
                        messages: st.messages.map((m) =>
                          m.id === compId
                            ? { ...m, compaction: { ...m.compaction!, tokensBefore: beforeTokens, tokensAfter: afterTokens } }
                            : m
                        ),
                      }));
                    }
                  } catch {}
                })();
              }
            }
          }
          return;
        }
        case "retry_status":
          patch(key, (s) => ({
            running: ev.state === "recovered" || ev.state === "cleared" ? s.running : true,
            notices: notice(s.notices, ev.state === "recovered" || ev.state === "cleared" ? null
              : { kind: "retry", text: `Retrying (${ev.attempt}${ev.max_attempts ? `/${ev.max_attempts}` : ""}): ${ev.error_kind}` }, ["retry"]),
          }));
          return;
        case "recovery_state": {
          const done = ev.status === "awaiting_user" || ev.status === "recovered" || ev.status === "failed";
          patch(key, (s) => ({
            running: done ? false : ev.status === "resuming" ? true : s.running,
            notices: notice(s.notices, { kind: "recovery", text: `Recovery ${ev.status}${ev.reason ? `: ${ev.reason}` : ""}` }, ["recovery", ...(done ? (["retry"] as const) : [])]),
          }));
          return;
        }
        case "turn_model_updated":
          patch(key, (s) => ({
            model: ev.model_name,
            preset: ev.model_preset ?? null,
            notices: ev.fallback ? notice(s.notices, { kind: "fallback", text: `Using fallback model ${ev.model_name}` }, []) : s.notices,
          }));
          return;
        case "subagent_task": // buffered/replayed like every other event; the store never subscribes itself
          subagentsStore.getState().ingest(key, [ev.task]);
          return;
        case "goal_status":
          patch(key, () => ({ running: ev.status === "running" }));
          return;
        case "error":
          if (ev.turn_id)
            patch(key, (s) => ({ notices: notice(s.notices, { kind: "stream_error", text: ev.reason || ev.detail || "Message rejected" }, []) }));
          return;
      }
    };

    const settle = (key: string) => {
      const rt = rtOf(key);
      patch(key, (s) => {
        // still-open answer segment only: stream_end closes it (activeAssistantId cleared) even if isStreaming lingers
        const open = [...s.messages].reverse().find((m) => m.isStreaming);
        rt.reopenId = open && open.id === rt.proj.activeAssistantId ? open.id : null;
        const messages = s.messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m));
        rt.proj = resetThreadProjectionCursor(rt.proj, messages);
        return { messages, running: false };
      });
    };

    /**
     * Load the persisted transcript and reconcile with live state, mirroring WebUI ThreadShell:
     * fence completed turns before anything else (ThreadShell.tsx:1149); never adopt a snapshot while the
     * turn is active or canReconcileCanonicalCompletion refuses (:1167-1171, :1203-1220); when adopted and the
     * snapshot is complete, reconcileCanonicalCompletion with the run generation captured BEFORE the fetch (:1302-1307).
     */
    const hydrate = async (session: NanobotSession, key: string) => {
      const rt = rtOf(key);
      const gen = ++rt.gen;
      rt.buffer = rt.buffer ?? [];
      const writable = isWritable(key);
      const chatId = chatIdOf(key);
      const client = session.client;
      if (chatsStore.getState().isTemporary(key)) {
        // never persisted: nothing to fetch; live events only
        rt.buffer = null;
        patch(key, () => ({ loaded: true }));
        return;
      }
      const drain = (skip: Set<string>) => {
        const evs = rt.buffer ?? [];
        rt.buffer = null;
        for (const ev of evs) {
          const t = (ev as { turn_id?: string }).turn_id;
          if (!(t && skip.has(t))) apply(key, ev);
        }
      };
      const runGen = writable ? client.getRunGeneration(chatId) : 0;
      patch(key, () => ({ hydrating: true, loadError: false }));
      try {
        const raw = await session.get<unknown>(threadPath(key)).catch((e: { status?: number }) => {
          if (e?.status === 404) return null;
          throw e;
        });
        if (gen !== rt.gen) return;
        rt.session = session;
        const payload = raw ? parseWebuiThreadPayload(raw) : null;
        const incomingEvents = payload?.events ?? [];
        if (!rt.loadedOnce) {
          rt.loadedOnce = true;
          rt.olderEvents = [];
          rt.newestEvents = incomingEvents;
          patch(key, () => ({
            hasMoreBefore: !!payload?.page?.has_more_before,
            beforeCursor: payload?.page?.before_cursor ?? null,
          }));
        } else {
          rt.newestEvents = incomingEvents;
        }

        const olderKeys = new Set(rt.olderEvents.map(eventKey));
        const nonOverlappingNewest = rt.newestEvents.filter((e) => !olderKeys.has(eventKey(e)));
        const allCanonicalEvents = [...rt.olderEvents, ...nonOverlappingNewest];
        const history = allCanonicalEvents.length > 0 ? projectThreadEvents(allCanonicalEvents) : [];
        const fb = payload?.fork_boundary_event_index;
        patch(key, () => ({
          forkBoundary: typeof fb === "number" ? projectThreadEvents(allCanonicalEvents.slice(0, rt.olderEvents.length + fb)).length : null,
        }));
        if (payload?.workspace_scope) workspaceStore.getState().setScope(key, payload.workspace_scope);
        const completed = payload?.completed_turn_ids ?? [];
        const hasPending = !!payload?.has_pending_tool_calls;
        const activeTurnId = payload?.active_turn_id ?? null;
        const active = hasPending || !!activeTurnId;
        if (writable) client.fenceCanonicalCompletedTurns(chatId, completed);
        const canonicalCompleted = Array.from(new Set([
          ...completed,
          ...history.filter((m) => m.role === "assistant" && m.turnId).map((m) => m.turnId as string),
        ]));
        const snapshot = {
          observedTurnIds: Array.from(new Set(history.filter((m) => m.role === "user" && m.turnId).map((m) => m.turnId as string))),
          hasPendingToolCalls: hasPending,
          activeTurnId,
        };
        const hadLive = (get().threads[key] ?? EMPTY).loaded;
        // ThreadShell.tsx:1189-1198 / :1234-1244: never adopt a snapshot older than not-yet-persisted local messages.
        const current = (get().threads[key] ?? EMPTY).messages;
        const stale = isStaleThreadSnapshot(current, history, hadLive);
        const keepLive = stale || hadLive && (active || (writable && !client.canReconcileCanonicalCompletion(chatId, runGen, canonicalCompleted, snapshot)));
        if (keepLive) {
          patch(key, (s) => {
            if (!active) return { running: s.running };
            // Deliberate mobile deviation (wiki/known-issues.md): the drop settled the streaming bubble
            // (run status -> null, as in the WebUI). Reopen it only if it was still streaming at that moment
            // (no stream_end) AND it is the last message, so resumed deltas continue it. Otherwise leave it settled
            // and let the next delta start a new segment, as the WebUI does.
            const i = s.messages.findIndex((m) => m.id === rt.reopenId);
            rt.reopenId = null;
            if (i < 0 || i !== s.messages.length - 1 || s.messages[i].role !== "assistant") return { running: true };
            const messages = s.messages.map((m, j) => (j === i ? { ...m, isStreaming: true } : m));
            const closed = new Set(rt.proj.closedAssistantIds);
            closed.delete(messages[i].id);
            rt.proj = { ...rt.proj, messages, activeAssistantId: messages[i].id, closedAssistantIds: closed };
            return { running: true, messages };
          });
          drain(new Set(completed));
          return;
        }
        rt.proj = createThreadProjectionState(history);
        patch(key, (s) => ({ messages: history, running: active, loaded: true, notices: notice(s.notices, null, ["compaction"]) }));
        const lastUsageIdx = history.map((m, i) => m.role === "assistant" && typeof m.usage?.context_tokens === "number" && m.usage.context_tokens >= 0 ? i : -1).reduce((max, i) => Math.max(max, i), -1);
        const lastCompactionIdx = history.map((m, i) => m.kind === "compaction" && m.compaction?.phase === "succeeded" ? i : -1).reduce((max, i) => Math.max(max, i), -1);
        if (lastCompactionIdx >= 0 && lastCompactionIdx > lastUsageIdx) {
          const targetId = history[lastCompactionIdx].id;
          void (async () => {
            try {
              const ctx = await session.get<{ estimated_session_tokens?: number }>(`/api/sessions/${encodeURIComponent(key)}/context`);
              const after = ctx?.estimated_session_tokens;
              if (typeof after === "number") {
                patch(key, (st) => ({
                  messages: st.messages.map((m) =>
                    m.id === targetId
                      ? { ...m, compaction: { ...m.compaction!, tokensAfter: after } }
                      : m
                  ),
                }));
              }
            } catch {}
          })();
        }
        if (writable && !active) {
          client.reconcileCanonicalCompletion(chatId, runGen, canonicalCompleted, snapshot);
          patch(key, () => ({ running: client.getRunStartedAt(chatId) != null }));
        } else if (writable) {
          patch(key, () => ({ running: true }));
        }
        // ponytail: replays live events from turns the transcript doesn't mark complete; a turn mid-stream
        // when the snapshot was taken may repeat its already-persisted prefix. Server-side cursor would fix it.
        drain(new Set(completed));
      } catch (e) {
        if (gen === rt.gen) drain(new Set());
        throw e;
      } finally {
        if (gen === rt.gen) {
          rt.buffer = null;
          patch(key, () => ({ hydrating: false }));
        }
      }
    };

    return {
      threads: {},

      async load(session, key) {
        cancelLeave(key);
        const vIdx = visitedChats.indexOf(key);
        if (vIdx !== -1) visitedChats.splice(vIdx, 1);
        visitedChats.push(key);
        get().unload(key);
        const rt = rtOf(key);
        rt.loadedOnce = false;
        rt.olderEvents = [];
        rt.newestEvents = [];
        patch(key, () => ({ temporary: chatsStore.getState().isTemporary(key) }));
        rt.buffer = []; // before onChat: vendor flushes queued inbound frames synchronously on subscribe
        if (isWritable(key)) {
          const chatId = chatIdOf(key);
          let wasDown = false;
          rt.unsubs.push(
            session.client.onChat(chatId, (ev) => (rt.buffer ? rt.buffer.push(ev) : apply(key, ev))),
            session.client.onRunStatus((id, state) => {
              if (id !== chatId) return;
              if (state.active) patch(key, () => ({ running: true }));
              else settle(key);
            }),
            session.client.onStatus((st) => {
              if (st !== "open") wasDown = true;
              else if (wasDown) {
                wasDown = false;
                if (chatsStore.getState().isTemporary(key)) return; // the server dropped it; the vendor never reattaches
                hydrate(session, key).catch(() => patch(key, () => ({ loadError: true })));
              }
            }),
          );
        }
        try {
          await hydrate(session, key);
        } catch (e) {
          // Never show a silently empty chat: mark the failure so the thread can offer Retry.
          if (__DEV__) console.warn("thread history load failed", e instanceof Error ? e.message : e);
          patch(key, () => ({ loaded: true, loadError: true }));
        }
      },

      unload(key) {
        clearTimeout(compactTimers.get(key));
        compactTimers.delete(key);
        const rt = rts.get(key);
        if (rt) {
          rt.gen++;
          rt.buffer = null;
          if (get().threads[key]) patch(key, () => ({ hydrating: false, loadingOlder: false }));
          rt.unsubs.forEach((u) => u());
          rt.unsubs = [];
        }

        // Memory: keep messages of last 5 visited chats plus any running one; evict the rest on unload
        const keepVisited = new Set(visitedChats.slice(-5));
        const currentThreads = get().threads;
        for (const k of Object.keys(currentThreads)) {
          const thread = currentThreads[k];
          if (!thread) continue;
          if (thread.running) continue;
          if (keepVisited.has(k)) continue;
          if (thread.messages && thread.messages.length > 0) {
            patch(k, () => ({ messages: [], loaded: false }));
            const oldRt = rts.get(k);
            if (oldRt) {
              oldRt.proj = createThreadProjectionState();
              oldRt.olderEvents = [];
              oldRt.newestEvents = [];
            }
          }
        }
      },

      async loadOlder(key, session) {
        const rt = rtOf(key);
        const s = session ?? rt.session;
        const cur = get().threads[key] ?? EMPTY;
        if (!s || cur.loadingOlder || !cur.hasMoreBefore || !cur.beforeCursor) return;
        const cursor = cur.beforeCursor;
        patch(key, () => ({ loadingOlder: true }));
        try {
          const path = `${threadPath(key)}?before=${encodeURIComponent(cursor)}`;
          const raw = await s.get<unknown>(path).catch(() => null);
          if (!raw) {
            patch(key, () => ({ loadingOlder: false }));
            return;
          }
          const payload = parseWebuiThreadPayload(raw);
          const incomingEvents = payload.events ?? [];

          const currentKeys = new Set([...rt.olderEvents, ...rt.newestEvents].map(eventKey));
          const newOlderEvents = incomingEvents.filter((e) => !currentKeys.has(eventKey(e)));
          rt.olderEvents = [...newOlderEvents, ...rt.olderEvents];

          const olderKeys = new Set(rt.olderEvents.map(eventKey));
          const nonOverlappingNewest = rt.newestEvents.filter((e) => !olderKeys.has(eventKey(e)));
          const allCanonicalEvents = [...rt.olderEvents, ...nonOverlappingNewest];

          const allHistory = projectThreadEvents(allCanonicalEvents);

          const currentMessages = (get().threads[key] ?? EMPTY).messages;
          const liveMessages = currentMessages.filter((m) => m.id.startsWith("live-") || m.isStreaming);
          const messages = [...allHistory, ...liveMessages];

          rt.proj = { ...rt.proj, messages };
          patch(key, () => ({
            messages,
            hasMoreBefore: !!payload.page?.has_more_before,
            beforeCursor: payload.page?.before_cursor ?? null,
            loadingOlder: false,
          }));
        } catch {
          patch(key, () => ({ loadingOlder: false }));
        }
      },

      leave(session, key) {
        const vIdx = visitedChats.indexOf(key);
        if (vIdx !== -1) visitedChats.splice(vIdx, 1);
        if (!chatsStore.getState().dropTemporary(key)) return;
        session.client.discardTemporaryChat(chatIdOf(key));
        const { [key]: _gone, ...rest } = get().threads;
        set({ threads: rest });
      },

      scheduleLeave(session, key) {
        cancelLeave(key);
        leaveTimers.set(key, setTimeout(() => {
          leaveTimers.delete(key);
          get().leave(session, key);
        }, LEAVE_DELAY_MS));
      },

      reset() {
        visitedChats.length = 0;
        [...leaveTimers.keys()].forEach(cancelLeave);
        for (const key of [...rts.keys()]) get().unload(key);
        rts.clear();
        set({ threads: {} });
      },

      send(session, key, text, opts = {}) {
        const files = opts.files ?? [];
        if (!isWritable(key) || (!text.trim() && !files.length)) return false;
        const rt = rtOf(key);
        rt.session = session;
        if ((get().threads[key] ?? EMPTY).uploading) return false;

        if (files.length > 0) {
          const lim = session.limits;
          const v0 = validateFiles(files, { ...lim, max_file_bytes: Infinity, max_total_bytes: Infinity });
          if (!v0.ok) {
            patch(key, () => ({ sendError: v0.reason }));
            return false;
          }
          const v1 = validateFiles(files, lim);
          const hasOnlyImages = files.every((f) => f.mime.startsWith("image/"));
          if (!v1.ok && !hasOnlyImages) {
            patch(key, () => ({ sendError: v1.reason }));
            return false;
          }
        }

        const slice = get().threads[key] ?? EMPTY;
        const replyingTo = slice.replyingTo;
        let fullText = text;
        if (replyingTo?.content) {
          const raw = replyingTo.content;
          const cut = raw.length > 500 ? raw.slice(0, 500) + "…" : raw;
          const quoteLines = cut.split(/\r?\n/).map((l) => `> ${l}`).join("\n");
          fullText = text ? `${quoteLines}\n\n${text}` : quoteLines;
          patch(key, () => ({ replyingTo: null }));
        }

        const running = slice.running;

        if (running && !opts.steer) {
          const id = `${Date.now().toString(36)}-${++ids}`;
          patch(key, (s) => ({
            queuedMessages: [...(s.queuedMessages ?? []), { id, text: fullText, opts }],
            draft: "",
          }));
          return true;
        }

        const turnId = `${Date.now().toString(36)}-${++ids}`;
        const rowId = `local-${turnId}`;
        const { files: _f, steer: _s, ...frameOpts } = opts;
        const options = { ...frameOpts, turnId, ...(running ? { startsNewRun: false } : {}) };
        patch(key, (s) => {
          // Guidance keeps the active answer cursor (useNanobotStream.ts:966); a fresh turn resets it.
          const base = { ...rt.proj, messages: s.messages };
          const proj = running ? clearThreadProjectionActivity(base) : resetThreadProjectionCursor(base, s.messages);
          const row: UIMessage = { id: rowId, role: "user", content: fullText, turnId, turnPhase: "user", turnSeq: 0, deliveryStatus: "sending", createdAt: Date.now() };
          if (files.length) row.media = files.map((f) => toMediaAttachment({ kind: f.mime.startsWith("image/") ? "image" : "file", url: f.uri, name: f.name }));
          const messages: UIMessage[] = [...s.messages, row];
          rt.proj = { ...proj, messages };
          return { messages, running: true, stopped: false, sendError: null, uploading: files.length > 0, ...(files.length ? {} : { draft: "" }), notices: s.notices.filter((n) => n.kind !== "stream_error" && n.kind !== "compaction") };
        });
        if (fullText.trim() === "/compact") {
          clearTimeout(compactTimers.get(key));
          compactTimers.set(
            key,
            setTimeout(() => {
              compactTimers.delete(key);
              toast.show(i18n.t("thread.compaction.nothingToCompact", { defaultValue: "Niente da compattare" }));
            }, 10000)
          );
        }
        chatsStore.getState().titleTemporary(key, fullText);
        if (!files.length) {
          session.client.sendMessage(chatIdOf(key), fullText, undefined, options);
          return true;
        }
        void (async () => {
          try {
            // type/count first, then re-encode oversized images (sequentially), then check sizes on the result
            const lim = session.limits;
            const v0 = validateFiles(files, { ...lim, max_file_bytes: Infinity, max_total_bytes: Infinity });
            if (!v0.ok) throw new Error(v0.reason);
            const prepared: LocalFile[] = [];
            for (const f of files) prepared.push(await prepareImage(f, lim.max_file_bytes));
            const v = validateFiles(prepared, lim);
            if (!v.ok) throw new Error(v.reason);
            const cap0 = session.uploadCapability;
            const refs = await uploadFiles(session, prepared);
            if (rts.get(key) !== rt) return;
            if (session.uploadCapability !== cap0) throw new Error("upload_unavailable");
            session.client.sendMessage(chatIdOf(key), fullText, refs, options);
            patch(key, (s) => ({ uploading: false, pendingFiles: [], ...(s.draft.trim() === text.trim() ? { draft: "" } : {}) }));
          } catch (e) {
            if (rts.get(key) !== rt) return;
            const code = e instanceof Error ? e.message : "upload_failed";
            patch(key, (s) => {
              const messages = s.messages.map((m) => (m.id === rowId ? { ...m, deliveryStatus: "failed" as const } : m));
              rt.proj = { ...rt.proj, messages };
              return { messages, uploading: false, running: running ? s.running : false, sendError: code };
            });
          }
        })();
        return true;
      },

      sendQueuedNow(session, key, id) {
        const queue = get().threads[key]?.queuedMessages ?? [];
        const item = queue.find((q) => q.id === id);
        if (!item) return;
        patch(key, (s) => ({
          queuedMessages: (s.queuedMessages ?? []).filter((q) => q.id !== id),
        }));
        get().send(session, key, item.text, { ...item.opts, steer: true });
      },

      modifyQueued(key, id) {
        const queue = get().threads[key]?.queuedMessages ?? [];
        const item = queue.find((q) => q.id === id);
        if (!item) return;
        patch(key, (s) => ({
          queuedMessages: (s.queuedMessages ?? []).filter((q) => q.id !== id),
          draft: item.text,
        }));
      },

      removeQueued(key, id) {
        patch(key, (s) => ({
          queuedMessages: (s.queuedMessages ?? []).filter((q) => q.id !== id),
        }));
      },

      setReplyingTo(key, message) {
        patch(key, () => ({ replyingTo: message }));
      },

      setPendingFiles(key, pendingFiles) {
        patch(key, () => ({ pendingFiles }));
      },

      stop(session, key) {
        if (!isWritable(key)) return;
        settle(key);
        rtOf(key).reopenId = null; // user stop: never reopen
        patch(key, (s) => ({ stopped: true, notices: notice(s.notices, null, ["retry"]) }));
        session.client.finishRunLocally(chatIdOf(key));
        session.client.sendMessage(chatIdOf(key), "/stop");
      },

      setDraft(key, draft) {
        patch(key, () => ({ draft }));
      },

      clearSendError(key) {
        patch(key, () => ({ sendError: null }));
      },

      cancelLeave(key) {
        cancelLeave(key);
      },
    };
  });
}

export const threadStore = createThreadStore();

export type ThreadActions = {
  setReplyingTo: (m: UIMessage | null) => void;
  sendQueuedNow: (id: string) => void;
  modifyQueued: (id: string) => void;
  removeQueued: (id: string) => void;
  loadOlder: () => Promise<void>;
  send: (text: string, opts?: SendOpts) => boolean;
  setPendingFiles: (files: LocalFile[]) => void;
  stop: () => void;
  setDraft: (text: string) => void;
  clearSendError: () => void;
};

export function useThreadActions(key: string): ThreadActions {
  return useMemo(
    () => ({
      setReplyingTo: (m: UIMessage | null) => threadStore.getState().setReplyingTo(key, m),
      sendQueuedNow: (id: string) => {
        const s = sessionStore.getState().session;
        if (s) threadStore.getState().sendQueuedNow(s, key, id);
      },
      modifyQueued: (id: string) => threadStore.getState().modifyQueued(key, id),
      removeQueued: (id: string) => threadStore.getState().removeQueued(key, id),
      loadOlder: () => {
        const s = sessionStore.getState().session;
        return s ? threadStore.getState().loadOlder(key, s) : Promise.resolve();
      },
      send: (text: string, opts?: SendOpts) => {
        const s = sessionStore.getState().session;
        return !!s && threadStore.getState().send(s, key, text, opts);
      },
      setPendingFiles: (files: LocalFile[]) => threadStore.getState().setPendingFiles(key, files),
      stop: () => {
        const s = sessionStore.getState().session;
        if (s) threadStore.getState().stop(s, key);
      },
      setDraft: (text: string) => threadStore.getState().setDraft(key, text),
      clearSendError: () => threadStore.getState().clearSendError(key),
    }),
    [key]
  );
}

/** Selector-only view of a thread plus actions; no load/unload effect (see useThread). */
export function useThreadSlice<T = ThreadSlice>(
  key: string,
  pick?: (slice: ThreadSlice) => T
): (T extends ThreadSlice ? ThreadSlice : T) & ThreadActions {
  const actions = useThreadActions(key);
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const prevRef = useRef<any>(undefined);

  const selector = useCallback(
    (s: { threads: Record<string, ThreadSlice> }) => {
      const slice = s.threads[key] ?? EMPTY;
      const next = pickRef.current ? pickRef.current(slice) : slice;
      if (prevRef.current !== undefined && shallow(prevRef.current, next)) {
        return prevRef.current;
      }
      prevRef.current = next;
      return next;
    },
    [key]
  );

  const selected = useStore(threadStore, selector);

  return useMemo(() => {
    if (!pickRef.current) {
      const slice = selected as ThreadSlice;
      return {
        ...slice,
        queuedMessages: slice.queuedMessages ?? [],
        replyingTo: slice.replyingTo ?? null,
        ...actions,
      } as any;
    }
    return {
      ...selected,
      ...actions,
    } as any;
  }, [selected, actions]);
}

/** Owns the thread's load/unload lifecycle: use it exactly once per chat (ThreadScreen). */
export function useThread(key: string) {
  const { session } = useSession();
  const slice = useThreadSlice(key);
  const load = useCallback(() => (session ? threadStore.getState().load(session, key) : Promise.resolve()), [session, key]);
  useEffect(() => {
    void load();
    return () => {
      threadStore.getState().unload(key);
      if (session) threadStore.getState().scheduleLeave(session, key);
    };
  }, [load, key, session]);
  return { ...slice, load };
}

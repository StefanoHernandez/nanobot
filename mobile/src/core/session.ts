import { Platform } from "react-native";
import { fetchBootstrap, BootstrapAuthRequiredError } from "@/lib/bootstrap";
import { NanobotClient } from "@/lib/nanobot-client";
import { uploadCapability, type UploadCapability } from "../../vendor/nanobot/packages/client-events/attachments";
import type { WebUIIngressLimits } from "@/lib/types";
import type { Profile } from "./profiles";

export const DEFAULT_LIMITS: WebUIIngressLimits["attachments"] = { max_count: 4, max_file_bytes: 6 * 2 ** 20, max_total_bytes: 24 * 2 ** 20 };

export function wsUrlFor(baseUrl: string, wsPath: string, token: string): string {
  const u = new URL(baseUrl);
  const scheme = u.protocol === "https:" ? "wss" : "ws";
  const path = u.pathname.replace(/\/+$/, "") + (wsPath.startsWith("/") ? wsPath : `/${wsPath}`);
  return `${scheme}://${u.host}${path}?token=${encodeURIComponent(token)}`;
}

/**
 * state = override ?? mapped vendor status.
 *  override "auth_error": bootstrap 401/403 or second 401 on an API call.
 *  override "offline":    NO bootstrap has ever succeeded in this session (cleared by the first good one).
 *                         Later non-auth refresh failures keep the mapped state and retry with backoff 1s..30s.
 *  mapped: idle|connecting -> connecting, open -> open, reconnecting|error -> reconnecting,
 *          closed -> unchanged (we closed it ourselves).
 */
export type SessionState = "connecting" | "open" | "reconnecting" | "auth_error" | "offline";

export type SessionDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
  socketFactory?: (url: string) => WebSocket;
};

type Boot = { apiToken: string; wsUrl: string };

export class NanobotSession {
  readonly client: NanobotClient;
  readonly baseUrl: string;
  /** Bootstrap ingress limits for attachments (fallback: 4 files, 6 MiB each, 24 MiB total). */
  limits: WebUIIngressLimits["attachments"] = DEFAULT_LIMITS;
  /** Bootstrap limits.transport.max_frame_bytes (WS frame cap); null when the server didn't send it. */
  frameLimit: number | null = null;
  /** Bootstrap limits.transport.envelope_reserve_bytes (JSON envelope overhead on top of the payload). */
  frameReserve: number | null = null;
  /** Bootstrap terminal.webui.capabilities (e.g. webui.subagents.v1). */
  capabilities: ReadonlySet<string> = new Set();
  /** Per-connection upload capability from the latest `ready` frame; null while disconnected. */
  uploadCapability: UploadCapability | null = null;
  private sock: WebSocket | null = null;
  private api = "";
  private mapped: SessionState = "connecting";
  private override: "auth_error" | "offline" | null = null;
  private inflight: Promise<Boot> | null = null;
  private timer: unknown = null;
  private listeners = new Set<(s: SessionState) => void>();
  private last: SessionState = "connecting";
  private stopped = false;
  private gen = 0; // bumped by stop(); stale async continuations bail out
  private everBooted = false;
  private lastRefreshAt = 0;
  private expiresIn = 300;
  private retryMs = 1000;
  private readonly now: () => number;
  private readonly f: typeof fetch;
  private readonly st: (fn: () => void, ms: number) => unknown;
  private readonly ct: (h: unknown) => void;

  constructor(profile: Profile, private secret: string, deps: SessionDeps = {}) {
    this.baseUrl = profile.baseUrl;
    // Native only: there `location` is the polyfill stub. In a browser it is the real one, and
    // assigning href navigates the page, which recreates the session and reloads forever.
    const loc = (globalThis as { location?: { href?: string } }).location;
    if (loc && Platform.OS !== "web") loc.href = this.baseUrl;
    // ponytail: bootstrap goes through vendor fetchBootstrap, which uses the global fetch; deps.fetch only covers get().
    this.now = deps.now ?? (() => Date.now());
    this.f = deps.fetch ?? ((...a) => fetch(...a));
    this.st = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.ct = deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.client = new NanobotClient({
      url: "",
      // Vendor limitation: connect() after close() (e.g. a pending reconnect timer / onReauth race) would
      // reopen a socket. After stop() hand back an already-closed fake so nothing real is opened.
      socketFactory: (u) => {
        if (this.stopped) return { readyState: 3, send() {}, close() {} } as unknown as WebSocket;
        const ws = (deps.socketFactory ?? ((x: string) => new WebSocket(x)))(u);
        // Capture the upload capability from every `ready` frame (never via the vendor's private client.upload).
        this.sock = ws;
        ws.addEventListener?.("message", (e: MessageEvent) => {
          if (typeof e.data !== "string" || !e.data.includes('"ready"')) return;
          try {
            const p = JSON.parse(e.data);
            if (p?.event === "ready" && this.sock === ws) this.uploadCapability = uploadCapability(p.upload);
          } catch {}
        });
        ws.addEventListener?.("close", () => {
          if (this.sock === ws) this.uploadCapability = null; // ignore stale sockets

        });
        return ws;
      },
      maxBackoffMs: 30_000,
      onReauth: async () => {
        const g = this.gen;
        if (this.stopped) return null;
        try {
          const b = await this.refresh();
          return this.stopped || g !== this.gen ? null : b.wsUrl;
        } catch {
          return null;
        }
      },
    });
    this.client.onStatus((s) => {
      if (s === "closed") return;
      this.mapped = s === "idle" || s === "connecting" ? "connecting" : s === "open" ? "open" : "reconnecting";
      this.emit();
    });
  }

  get state(): SessionState {
    return this.override ?? this.mapped;
  }

  onState(cb: (s: SessionState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  apiToken(): string {
    return this.api;
  }

  private emit(): void {
    const s = this.state;
    if (s === this.last) return;
    this.last = s;
    for (const l of this.listeners) l(s);
  }

  private setOverride(o: "auth_error" | "offline" | null): void {
    this.override = o;
    this.emit();
  }

  /** Single-flight bootstrap shared by proactive timer, 401 retries and WS reauth. */
  private refresh(): Promise<Boot> {
    if (this.inflight) return this.inflight;
    const g = this.gen;
    const p = (async () => {
      try {
        const b = await fetchBootstrap(this.baseUrl, this.secret, 10_000);
        const boot = { apiToken: b.api_token ?? b.token ?? "", wsUrl: wsUrlFor(this.baseUrl, b.ws_path, b.token ?? "") };
        if (g !== this.gen) return boot; // stopped meanwhile: apply nothing
        this.api = boot.apiToken;
        this.everBooted = true;
        this.lastRefreshAt = this.now();
        this.expiresIn = b.expires_in ?? 300;
        this.limits = b.limits?.attachments ?? DEFAULT_LIMITS;
        this.frameReserve = b.limits?.transport?.envelope_reserve_bytes ?? null;
        this.frameLimit = b.limits?.transport?.max_frame_bytes ?? null;
        this.capabilities = new Set(b.terminal?.webui?.capabilities ?? []);
        this.retryMs = 1000;
        this.setOverride(null);
        this.schedule(Math.max(30, this.expiresIn - 30) * 1000);
        return boot;
      } catch (e) {
        if (g === this.gen) {
          if (e instanceof BootstrapAuthRequiredError) this.setOverride("auth_error");
          else {
            if (!this.everBooted) this.setOverride("offline");
            this.schedule(this.retryMs);
            this.retryMs = Math.min(this.retryMs * 2, 30_000);
          }
        }
        throw e;
      }
    })();
    this.inflight = p;
    const clear = () => {
      if (this.inflight === p) this.inflight = null;
    };
    p.then(clear, clear);
    return p;
  }

  private schedule(ms: number): void {
    if (this.timer !== null) this.ct(this.timer);
    const g = this.gen;
    this.timer = this.stopped
      ? null
      : this.st(() => {
          this.timer = null;
          if (g !== this.gen || this.stopped) return;
          this.refresh()
            .then((b) => {
              // first boot was offline: start() threw before connecting, so open the socket now
              if (this.stopped || g !== this.gen || this.client.status !== "idle") return;
              this.client.updateUrl(b.wsUrl);
              this.client.connect();
            })
            .catch(() => {}); // failure path reschedules itself with backoff
        }, ms);
  }

  async start(): Promise<void> {
    this.stopped = false;
    const g = this.gen;
    const b = await this.refresh();
    if (this.stopped || g !== this.gen) return;
    this.client.updateUrl(b.wsUrl);
    this.client.connect();
  }

  stop(): void {
    this.stopped = true;
    this.gen++;
    this.uploadCapability = null;
    if (this.timer !== null) this.ct(this.timer);
    this.timer = null;
    this.client.close();
  }

  resume(): void {
    if (this.stopped) return;
    const aged = this.everBooted && this.now() - this.lastRefreshAt > Math.max(30, this.expiresIn - 30) * 1000;
    const notOpen = this.client.status !== "open";
    if (!aged && !notOpen) return;
    const g = this.gen;
    this.refresh()
      .then((b) => {
        if (this.stopped || g !== this.gen || this.client.status === "open") return;
        this.client.updateUrl(b.wsUrl);
        this.client.close();
        this.client.connect();
      })
      .catch(() => {});
  }

  async get<T>(path: string): Promise<T> {
    const doFetch = (token: string) =>
      this.f(`${this.baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (this.inflight) await this.inflight.catch(() => {}); // gate on an in-flight refresh
    const used = this.api;
    let res = await doFetch(used);
    if (res.status === 401) {
      // token already rotated by a concurrent refresh -> just retry with it
      if (this.api === used || !this.api) await this.refresh();
      res = await doFetch(this.api);
      if (res.status === 401) {
        this.setOverride("auth_error");
        throw new Error("unauthorized");
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = text;
      try {
        const j = JSON.parse(text) as { error?: unknown };
        if (typeof j?.error === "string") msg = j.error;
      } catch {}
      const err = new Error(msg || `HTTP ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  }

  async mutate<T>(action: string, payload: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    try {
      return await this.client.requestMutation<T>(action, payload, timeoutMs);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const err = new Error(e instanceof Error ? e.message : String((e as { message?: unknown }).message ?? e));
      (err as Error & { status?: number }).status = status;
      throw err;
    }
  }
}

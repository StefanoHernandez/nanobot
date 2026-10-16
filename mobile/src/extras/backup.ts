import { createStore, useStore } from "zustand";
import type { NanobotSession } from "../core/session";
import { sessionStore } from "../state/sessionStore";

export type BackupItem = {
  name: string;
  size: number;
  created_at: number;
};

export type BackupListPayload = {
  backups: BackupItem[];
  max_backups: number;
  dir: string;
  disk_free: number;
  workspace_included: boolean;
};

export type RestoreBackupResponse = {
  ok: boolean;
  restored: string;
  previous: string;
  restart_required: boolean;
};

export type BackupState = {
  data: BackupListPayload | null;
  loading: boolean;
  creating: boolean;
  acting: string | null;
  error: string | null;
  refresh: () => Promise<void>;
  create: () => Promise<boolean>;
  remove: (name: string) => Promise<boolean>;
  restore: (name: string) => Promise<RestoreBackupResponse | null>;
  reset: () => void;
};

export const CREATE_BACKUP_TIMEOUT_MS = 120_000;

export function backupErrorKey(err: unknown): string {
  const code = (err as { code?: string })?.code ?? (err as Error)?.message ?? "";
  const status = (err as { status?: number })?.status;
  if (code === "backup_in_progress" || status === 409) {
    return "backup.inProgress";
  }
  if (code === "not_a_nanobot_backup") {
    return "backup.notNanobot";
  }
  if (code === "unsafe_archive") {
    return "backup.unsafe";
  }
  return "common.operationFailed";
}

async function parseError(res: Response): Promise<Error & { status?: number; code?: string }> {
  let code = "";
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === "string") code = body.error;
  } catch {
    // ignore JSON parse failure
  }
  const err = new Error(code || `HTTP ${res.status}`) as Error & { status?: number; code?: string };
  err.status = res.status;
  err.code = code;
  return err;
}

export async function fetchBackups(session: NanobotSession): Promise<BackupListPayload> {
  const root = session.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/backup`, {
    method: "GET",
    redirect: "error",
    credentials: "omit",
    headers: { Authorization: `Bearer ${session.apiToken()}` },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as BackupListPayload;
}

export async function createBackupRequest(
  session: NanobotSession,
  timeoutMs: number = CREATE_BACKUP_TIMEOUT_MS,
): Promise<{ backup: BackupItem }> {
  const root = session.baseUrl.replace(/\/+$/, "");
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  if (timer && typeof (timer as any).unref === "function") {
    (timer as any).unref();
  }
  try {
    const res = await fetch(`${root}/api/ext/backup/create`, {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${session.apiToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    if (!res.ok) {
      throw await parseError(res);
    }
    return (await res.json()) as { backup: BackupItem };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function deleteBackupRequest(
  session: NanobotSession,
  name: string,
): Promise<{ ok: boolean }> {
  const root = session.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/backup/delete`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${session.apiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as { ok: boolean };
}

export async function restoreBackupRequest(
  session: NanobotSession,
  name: string,
): Promise<RestoreBackupResponse> {
  const root = session.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/backup/restore`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${session.apiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, confirm: true }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as RestoreBackupResponse;
}

let generation = 0;

export const backupStore = createStore<BackupState>((set, get) => ({
  data: null,
  loading: false,
  creating: false,
  acting: null,
  error: null,

  refresh: async () => {
    const thisGen = ++generation;
    const session = sessionStore.getState().session;
    const profileId = sessionStore.getState().profile?.id;
    if (!session) {
      if (thisGen !== generation) return;
      set({ data: null, loading: false, error: null });
      return;
    }

    set({ loading: true });
    try {
      const data = await fetchBackups(session);
      if (thisGen !== generation) return;
      if (sessionStore.getState().profile?.id !== profileId) return;
      set({ data, loading: false, error: null });
    } catch (err) {
      if (thisGen !== generation) return;
      if (sessionStore.getState().profile?.id !== profileId) return;
      set({ loading: false, error: backupErrorKey(err) });
    }
  },

  create: async () => {
    const session = sessionStore.getState().session;
    const profileId = sessionStore.getState().profile?.id;
    if (!session) return false;

    set({ creating: true, error: null });
    try {
      await createBackupRequest(session, CREATE_BACKUP_TIMEOUT_MS);
      if (sessionStore.getState().profile?.id !== profileId) return false;
      await get().refresh();
      return true;
    } catch (err) {
      if (sessionStore.getState().profile?.id !== profileId) return false;
      set({ error: backupErrorKey(err) });
      return false;
    } finally {
      if (sessionStore.getState().profile?.id === profileId) {
        set({ creating: false });
      }
    }
  },

  remove: async (name: string) => {
    const session = sessionStore.getState().session;
    const profileId = sessionStore.getState().profile?.id;
    if (!session) return false;

    set({ acting: name, error: null });
    try {
      await deleteBackupRequest(session, name);
      if (sessionStore.getState().profile?.id !== profileId) return false;
      await get().refresh();
      return true;
    } catch (err) {
      if (sessionStore.getState().profile?.id !== profileId) return false;
      set({ error: backupErrorKey(err) });
      return false;
    } finally {
      if (sessionStore.getState().profile?.id === profileId) {
        set({ acting: null });
      }
    }
  },

  restore: async (name: string) => {
    const session = sessionStore.getState().session;
    const profileId = sessionStore.getState().profile?.id;
    if (!session) return null;

    set({ acting: name, error: null });
    try {
      const res = await restoreBackupRequest(session, name);
      if (sessionStore.getState().profile?.id !== profileId) return null;
      return res;
    } catch (err) {
      if (sessionStore.getState().profile?.id !== profileId) return null;
      set({ error: backupErrorKey(err) });
      return null;
    } finally {
      if (sessionStore.getState().profile?.id === profileId) {
        set({ acting: null });
      }
    }
  },

  reset: () => {
    generation++;
    set({
      data: null,
      loading: false,
      creating: false,
      acting: null,
      error: null,
    });
  },
}));

// Clear on profile switch
sessionStore.subscribe((state, prev) => {
  if (state.profile?.id !== prev?.profile?.id) {
    backupStore.getState().reset();
  }
});

export function useBackups() {
  return useStore(backupStore);
}

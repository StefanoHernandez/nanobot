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
  saveDir: (dir: string) => Promise<boolean>;
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
  if (code === "invalid_dir" || status === 400) {
    return "backup.invalidDir";
  }
  return "common.operationFailed";
}

function wrapError(err: any): never {
  if (err && typeof err === "object") {
    err.code = err.code ?? err.message;
  }
  throw err;
}

export async function fetchBackups(session: NanobotSession): Promise<BackupListPayload> {
  try {
    return await session.get<BackupListPayload>("/api/ext/backup");
  } catch (e) {
    wrapError(e);
  }
}

export async function createBackupRequest(
  session: NanobotSession,
  timeoutMs: number = CREATE_BACKUP_TIMEOUT_MS,
): Promise<{ backup: BackupItem }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await session.post<{ backup: BackupItem }>("/api/ext/backup/create", {}, { signal: ctrl.signal });
  } catch (e) {
    wrapError(e);
  } finally {
    clearTimeout(timer);
  }
}

export async function deleteBackupRequest(
  session: NanobotSession,
  name: string,
): Promise<{ ok: boolean }> {
  try {
    return await session.post<{ ok: boolean }>("/api/ext/backup/delete", { name });
  } catch (e) {
    wrapError(e);
  }
}

export async function restoreBackupRequest(
  session: NanobotSession,
  name: string,
): Promise<RestoreBackupResponse> {
  try {
    return await session.post<RestoreBackupResponse>("/api/ext/backup/restore", { name, confirm: true });
  } catch (e) {
    wrapError(e);
  }
}

export async function saveBackupSettingsRequest(
  session: NanobotSession,
  dir: string,
): Promise<{ ok: boolean; dir?: string }> {
  try {
    return await session.post<{ ok: boolean; dir?: string }>("/api/ext/backup/settings", { dir });
  } catch (e) {
    wrapError(e);
  }
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

  saveDir: async (dir: string) => {
    const session = sessionStore.getState().session;
    const profileId = sessionStore.getState().profile?.id;
    if (!session) return false;

    set({ error: null });
    try {
      await saveBackupSettingsRequest(session, dir);
      if (sessionStore.getState().profile?.id !== profileId) return false;
      await get().refresh();
      return true;
    } catch (err) {
      if (sessionStore.getState().profile?.id !== profileId) return false;
      set({ error: backupErrorKey(err) });
      return false;
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

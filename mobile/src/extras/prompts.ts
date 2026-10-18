import { useEffect, useCallback } from "react";
import { createStore, useStore } from "zustand";
import type { NanobotSession } from "../core/session";
import { sessionStore } from "../state/sessionStore";
import { i18n } from "../i18n";

export type PromptItem = {
  id: string;
  title: string;
  body: string;
  project_id: string | null;
  variables: string[];
  created_at: number;
  updated_at: number;
  used_at: number | null;
};

export type SavePromptPayload = {
  id?: string;
  title: string;
  body: string;
  project_id?: string | null;
};

export type PromptsState = {
  prompts: PromptItem[];
  loading: boolean;
  error: string | null;
  currentProjectId: string | null | undefined;
  refresh: (projectId?: string | null) => Promise<void>;
  reset: () => void;
};

export function fillPrompt(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_ ]{0,39}?)\s*\}\}/g, (match, key) => {
    const k = key.trim();
    return Object.hasOwn(values, k) ? values[k] : match;
  });
}

export function extractVariables(body: string): string[] {
  const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_ ]{0,39}?)\s*\}\}/g;
  const list: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].trim();
    if (name && !list.includes(name)) {
      list.push(name);
    }
  }
  return list;
}

let generation = 0;

export async function listPrompts(
  session: NanobotSession,
  projectId?: string | null,
): Promise<PromptItem[]> {
  const query = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
  const data = await session.get<{ prompts: PromptItem[] }>(`/api/ext/prompts${query}`);
  return data.prompts ?? [];
}

export async function savePrompt(
  session: NanobotSession,
  prompt: SavePromptPayload,
): Promise<PromptItem> {
  try {
    const data = await session.post<{ prompt: PromptItem }>("/api/ext/prompts/save", prompt);
    return data.prompt;
  } catch (err: any) {
    if (err && typeof err === "object") {
      err.code = err.code ?? err.message;
    }
    throw err;
  }
}

export async function deletePrompt(
  session: NanobotSession,
  id: string,
): Promise<boolean> {
  await session.post("/api/ext/prompts/delete", { id });
  return true;
}

export async function markUsed(
  session: NanobotSession,
  id: string,
): Promise<boolean> {
  await session.post("/api/ext/prompts/used", { id });
  return true;
}

export const promptsStore = createStore<PromptsState>((set, get) => ({
  prompts: [],
  loading: false,
  error: null,
  currentProjectId: undefined,

  refresh: async (projectId?: string | null) => {
    const thisGen = ++generation;
    const session = sessionStore?.getState ? sessionStore.getState()?.session : null;
    const profileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;

    if (!session) {
      if (thisGen !== generation) return;
      set({ prompts: [], loading: false, error: null, currentProjectId: projectId });
      return;
    }

    set({ loading: true, error: null });
    try {
      const list = await listPrompts(session, projectId);
      if (thisGen !== generation) return;
      const currentProfileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;
      if (profileId !== currentProfileId) return;

      set({
        prompts: list,
        loading: false,
        error: null,
        currentProjectId: projectId,
      });
    } catch (e: any) {
      if (thisGen !== generation) return;
      set({
        error: i18n.t("common.operationFailed"),
        loading: false,
      });
    }
  },

  reset: () => {
    generation++;
    set({
      prompts: [],
      loading: false,
      error: null,
      currentProjectId: undefined,
    });
  },
}));

if (sessionStore && typeof sessionStore.subscribe === "function") {
  sessionStore.subscribe((state, prev) => {
    if (state.profile?.id !== prev?.profile?.id) {
      promptsStore.getState().reset();
    }
  });
}

export function usePrompts(projectId?: string | null, enabled = true) {
  const prompts = useStore(promptsStore, (s) => s?.prompts ?? []);
  const loading = useStore(promptsStore, (s) => s?.loading ?? false);
  const error = useStore(promptsStore, (s) => s?.error ?? null);
  const isOpen = typeof (sessionStore as any)?.getState === "function"
    ? useStore(sessionStore, (s) => s?.state === "open")
    : false;

  useEffect(() => {
    if (isOpen && enabled) {
      void promptsStore.getState().refresh(projectId);
    }
  }, [isOpen, projectId, enabled]);

  const refresh = useCallback(async () => {
    await promptsStore.getState().refresh(projectId);
  }, [projectId]);

  return {
    prompts,
    loading,
    error,
    refresh,
  };
}

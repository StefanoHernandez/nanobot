import { createStore, useStore } from "zustand";
import { sessionStore } from "../state/sessionStore";
import { listProjects, type Project } from "./api";

export type ByPathLookup = Record<string, Project> & ((path: string) => Project | undefined);

function createByPath(list: Project[]): ByPathLookup {
  const map: Record<string, Project> = {};
  for (const p of list) {
    if (p.path) {
      map[p.path] = p;
    }
  }
  const fn = (path: string) => map[path];
  return Object.assign(fn, map);
}

export type RefreshOptions = {
  ifStaleMs?: number;
};

export type ProjectsState = {
  projects: Project[];
  loading: boolean;
  error: string | null;
  byPath: ByPathLookup;
  refresh: (opts?: RefreshOptions) => Promise<void>;
  reset: () => void;
};

const initialProjects: Project[] = [];
const initialByPath = createByPath(initialProjects);

let generation = 0;
let lastRefreshedAt = 0;

export const projectsStore = createStore<ProjectsState>((set, get) => ({
  projects: initialProjects,
  loading: false,
  error: null,
  byPath: initialByPath,

  refresh: async (opts?: RefreshOptions) => {
    if (opts?.ifStaleMs && Date.now() - lastRefreshedAt < opts.ifStaleMs) {
      return;
    }

    const currentGen = generation;
    const session = sessionStore?.getState ? sessionStore.getState()?.session : null;
    if (!session) {
      if (currentGen !== generation) return;
      set({ projects: [], byPath: createByPath([]), loading: false, error: null });
      return;
    }

    set({ loading: true, error: null });
    try {
      const res = await listProjects(session);
      if (currentGen !== generation) return;
      lastRefreshedAt = Date.now();
      const list = Array.isArray(res) ? res : (res?.projects ?? []);
      set({
        projects: list,
        byPath: createByPath(list),
        loading: false,
        error: null,
      });
    } catch (e: any) {
      if (currentGen !== generation) return;
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  reset: () => {
    generation++;
    lastRefreshedAt = 0;
    set({
      projects: [],
      byPath: createByPath([]),
      loading: false,
      error: null,
    });
  },
}));

// Clear on profile switch; load projects once when a session opens
if (sessionStore && typeof sessionStore.subscribe === "function") {
  sessionStore.subscribe((state, prev) => {
    if (state.profile?.id !== prev?.profile?.id) {
      projectsStore.getState().reset();
    }
    if (state.state === "open" && prev?.state !== "open") {
      void projectsStore.getState().refresh();
    }
  });
}

export function useProjects<T>(selector: (state: ProjectsState) => T): T {
  return useStore(projectsStore, selector);
}

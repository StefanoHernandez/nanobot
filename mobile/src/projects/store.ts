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

export type ProjectsState = {
  projects: Project[];
  loading: boolean;
  error: string | null;
  byPath: ByPathLookup;
  refresh: () => Promise<void>;
  reset: () => void;
};

const initialProjects: Project[] = [];
const initialByPath = createByPath(initialProjects);

export const projectsStore = createStore<ProjectsState>((set, get) => ({
  projects: initialProjects,
  loading: false,
  error: null,
  byPath: initialByPath,

  refresh: async () => {
    const session = sessionStore.getState().session;
    if (!session) {
      set({ projects: [], byPath: createByPath([]), loading: false, error: null });
      return;
    }

    set({ loading: true, error: null });
    try {
      const res = await listProjects(session);
      const list = Array.isArray(res) ? res : (res?.projects ?? []);
      set({
        projects: list,
        byPath: createByPath(list),
        loading: false,
        error: null,
      });
    } catch (e: any) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  reset: () => {
    set({
      projects: [],
      byPath: createByPath([]),
      loading: false,
      error: null,
    });
  },
}));

// Clear on profile switch: subscribe to sessionStore profile id changes
if (sessionStore && typeof sessionStore.subscribe === "function") {
  sessionStore.subscribe((state, prev) => {
    if (state.profile?.id !== prev?.profile?.id) {
      projectsStore.getState().reset();
    }
  });
}

export function useProjects<T>(selector: (state: ProjectsState) => T): T {
  return useStore(projectsStore, selector);
}

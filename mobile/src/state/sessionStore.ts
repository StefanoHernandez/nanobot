import { createStore, useStore } from "zustand";
import { NanobotSession, type SessionState } from "../core/session";
import { profiles, type Profile } from "../core/profiles";
import { chatsStore } from "./chatsStore";
import { subagentsStore } from "./subagentsStore";
import { settingsStore } from "../settings/store";
import { clearCatalogCache } from "../settings/models";
import { threadStore } from "./threadStore";

type S = {
  session: NanobotSession | null;
  state: SessionState | "none";
  profile: Profile | null;
  /** Start the given (default: active) profile's session, replacing any running one. */
  open(profileId?: string | null): Promise<void>;
  close(): void;
};

export const sessionStore = createStore<S>((set, get) => {
  let unsub: (() => void) | null = null;
  let seq = 0; // a newer open()/close() invalidates an older one still awaiting the secret

  const close = () => {
    seq++;
    unsub?.();
    unsub = null;
    get().session?.stop?.();
    chatsStore.getState().bind(null);
    threadStore.getState().reset();
    subagentsStore.getState().reset();
    settingsStore.getState().reset();
    clearCatalogCache();
    set({ session: null, state: "none", profile: null });
  };

  return {
    session: null,
    state: "none",
    profile: null,
    close,
    async open(profileId = profiles.activeId()) {
      close();
      const mine = seq;
      const profile = profiles.list().find((p) => p.id === profileId);
      if (!profile) return;
      let secret: string;
      try {
        secret = await profiles.getSecret(profile.id);
      } catch {
        // SecureStore unreadable (e.g. keystore invalidated by a restored backup): ask for the secret again
        if (mine === seq) set({ profile, state: "auth_error" });
        return;
      }
      if (mine !== seq) return;
      const session = new NanobotSession(profile, secret);
      unsub = session.onState((state) => set({ state }));
      set({ session, profile, state: session.state });
      chatsStore.getState().bind(session);
      try {
        await session.start();
      } catch {
        // state is reported through onState (auth_error / offline)
      }
      if (mine === seq) {
        set({ state: session.state });
        void chatsStore.getState().refresh();
      }
    },
  };
});

export const useSession = () => {
  const session = useStore(sessionStore, (s) => s.session);
  const state = useStore(sessionStore, (s) => s.state);
  const profile = useStore(sessionStore, (s) => s.profile);
  return { session, state, profile };
};

import { useEffect } from "react";
import { AppState } from "react-native";
import { createStore, useStore } from "zustand";
import type { NanobotSession } from "../core/session";
import { isServerBrowser } from "../platform/serverMode";
import { sessionStore, useSession } from "../state/sessionStore";

// Whether this client may install or delete packages with the host flag off: a browser on the
// server itself, or a device granted full power there. UI only; the server enforces both.
const store = createStore<{ session: NanobotSession | null; fullPower: boolean }>(() => ({ session: null, fullPower: false }));
let asked: NanobotSession | null = null;

function ask(session: NanobotSession): void {
  asked = session;
  Promise.resolve()
    .then(() => session.get<{ self?: { full_power?: unknown } }>("/api/ext/devices"))
    .then((d) => d?.self?.full_power === true, () => false)
    .then((fullPower) => {
      if (asked === session) store.setState({ session, fullPower });
    });
}

// A grant made on the server shows up when the app comes back to the foreground.
AppState.addEventListener?.("change", (s) => {
  const session = sessionStore?.getState?.().session;
  if (s === "active" && session) ask(session);
});

export function usePrivileged(): boolean {
  const { session } = useSession();
  const known = useStore(store);
  useEffect(() => {
    if (session && asked !== session) ask(session);
  }, [session]);
  return isServerBrowser() || (!!session && known.session === session && known.fullPower);
}

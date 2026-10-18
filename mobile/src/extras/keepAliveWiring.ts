import { sessionStore } from "../state/sessionStore";
import { prefs } from "../settings/prefs";
import { keepAlive } from "../platform/keepAlive";

let serviceRunning = false;

export function resetKeepAliveWiringState(): void {
  serviceRunning = false;
}

export async function syncKeepAlive(): Promise<void> {
  const { state } = sessionStore.getState();
  const enabled = prefs.backgroundConnection();

  if (!enabled) {
    if (serviceRunning) {
      serviceRunning = false;
      await keepAlive.stop().catch(() => {});
    }
  } else if (state === "open") {
    if (!serviceRunning) {
      serviceRunning = true;
      await keepAlive.start().catch(() => {});
    }
  } else if (state === "none") {
    if (serviceRunning) {
      serviceRunning = false;
      await keepAlive.stop().catch(() => {});
    }
  }
}

/**
 * Starts the KeepAlive foreground service when a session is connected and
 * the pref is on; stops it when session closes or pref is turned off.
 */
export function startKeepAliveWiring(): () => void {
  void syncKeepAlive();

  const unsubSession = sessionStore.subscribe(() => {
    void syncKeepAlive();
  });

  const unsubPrefs = prefs.subscribeBackgroundConnection(() => {
    void syncKeepAlive();
  });

  return () => {
    serviceRunning = false;
    unsubSession();
    unsubPrefs();
  };
}

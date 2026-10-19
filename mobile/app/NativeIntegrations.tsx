import { useEffect, useRef } from "react";
import { router, useRootNavigationState } from "expo-router";
import { useLastNotificationResponse } from "expo-notifications";
import { useShareIntent } from "expo-share-intent";
import { useStore } from "zustand";
import { lockStore } from "../src/extras/lockStore";
import { profiles } from "../src/core/profiles";
import { pathOfResponse, setupNotifications, startTurnNotifications } from "../src/extras/notifications";
import { handleShare } from "../src/extras/share";
import { startKeepAliveWiring } from "../src/extras/keepAliveWiring";
import { useSession } from "../src/state/sessionStore";

/** Notification wiring, tap-to-open and share intake. Navigation waits for the root navigator to be ready. */
export function NativeIntegrations() {
  const { state } = useSession();
  const ready = !!useRootNavigationState()?.key;
  const tapped = pathOfResponse(useLastNotificationResponse());
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const { enabled, locked } = useStore(lockStore);
  const isLocked = enabled && locked;
  const handledTapRef = useRef<string | null>(null);

  useEffect(() => {
    void setupNotifications().catch(() => {});
    return startTurnNotifications();
  }, []);

  useEffect(() => {
    return startKeepAliveWiring();
  }, []);

  useEffect(() => {
    if (!ready || isLocked || !tapped) return;
    if (handledTapRef.current === tapped) return;
    handledTapRef.current = tapped;
    router.push(tapped as never);
  }, [ready, isLocked, tapped]);

  // newChat needs an open session, unless there is no profile at all (handleShare then routes to /connect).
  useEffect(() => {
    if (!ready || isLocked || !hasShareIntent || (state !== "open" && !(state === "none" && !profiles.activeId()))) return;
    resetShareIntent();
    void handleShare(shareIntent);
  }, [ready, isLocked, hasShareIntent, shareIntent, state, resetShareIntent]);

  return null;
}


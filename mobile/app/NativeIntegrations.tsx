import { useEffect } from "react";
import { router, useRootNavigationState } from "expo-router";
import { useLastNotificationResponse } from "expo-notifications";
import { useShareIntent } from "expo-share-intent";
import { profiles } from "../src/core/profiles";
import { chatPath, keyOfResponse, setupNotifications, startTurnNotifications } from "../src/extras/notifications";
import { handleShare } from "../src/extras/share";
import { useSession } from "../src/state/sessionStore";

/** Notification wiring, tap-to-open and share intake. Navigation waits for the root navigator to be ready. */
export function NativeIntegrations() {
  const { state } = useSession();
  const ready = !!useRootNavigationState()?.key;
  const tapped = keyOfResponse(useLastNotificationResponse());
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    void setupNotifications().catch(() => {});
    return startTurnNotifications();
  }, []);

  useEffect(() => {
    if (ready && tapped) router.push(chatPath(tapped) as never);
  }, [ready, tapped]);

  // newChat needs an open session, unless there is no profile at all (handleShare then routes to /connect).
  useEffect(() => {
    if (!ready || !hasShareIntent || (state !== "open" && !(state === "none" && !profiles.activeId()))) return;
    resetShareIntent();
    void handleShare(shareIntent);
  }, [ready, hasShareIntent, shareIntent, state, resetShareIntent]);

  return null;
}

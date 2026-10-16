import { useEffect, useRef, type ReactNode } from "react";
import { AppState } from "react-native";
import { router, usePathname, useRootNavigationState } from "expo-router";
import { profiles } from "../core/profiles";
import { sessionStore, useSession } from "./sessionStore";

/** True once the root navigator is mounted and this path is not already Connect. */
export function shouldRedirectToConnect(input: {
  needsConnect: boolean;
  navReady: boolean;
  pathname: string;
}): boolean {
  return input.needsConnect && input.navReady && !input.pathname.startsWith("/connect");
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session, state } = useSession();
  const pathname = usePathname();
  const nav = useRootNavigationState();
  const redirected = useRef(false);

  useEffect(() => {
    void sessionStore.getState().open();
    return () => sessionStore.getState().close();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") sessionStore.getState().session?.resume();
    });
    return () => sub.remove();
  }, [session]);

  // Redirect to /connect on auth_error or when no profile is active, once per trigger.
  // Web's root route list does not include the name "connect", so readiness is the navigator key.
  const needsConnect = state === "auth_error" || (state === "none" && !profiles.activeId());
  const navReady = !!nav?.key;
  useEffect(() => {
    if (!needsConnect) redirected.current = false;
    else if (!redirected.current && shouldRedirectToConnect({ needsConnect, navReady, pathname })) {
      redirected.current = true;
      const activeProfile = profiles.list().find((p) => p.id === profiles.activeId());
      const isCookie = activeProfile?.auth === "cookie";
      const target = state === "auth_error"
        ? (isCookie ? "/connect?reason=web_session_ended" : "/connect?reason=auth")
        : "/connect";
      router.replace(target as never);
    }
  }, [needsConnect, navReady, pathname, state]);

  return <>{children}</>;
}

import { useEffect, useRef, type ReactNode } from "react";
import { AppState } from "react-native";
import { router, usePathname, useRootNavigationState } from "expo-router";
import { profiles } from "../core/profiles";
import { sessionStore, useSession } from "./sessionStore";

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

  // Redirect to /connect on auth_error or when no profile is active; once per trigger, only if the route exists.
  const needsConnect = state === "auth_error" || (state === "none" && !profiles.activeId());
  const routeExists = !!nav?.routeNames?.includes("connect");
  useEffect(() => {
    if (!needsConnect) redirected.current = false;
    else if (routeExists && !redirected.current && !pathname.startsWith("/connect")) {
      redirected.current = true;
      router.replace((state === "auth_error" ? "/connect?reason=auth" : "/connect") as never);
    }
  }, [needsConnect, routeExists, pathname]);

  return <>{children}</>;
}

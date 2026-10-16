import { Platform } from "react-native";

/**
 * Returns true if the client is running in a browser on the server machine itself
 * (localhost, 127.0.0.1, or [::1]).
 *
 * This is a UI hint only: never use it to skip authentication or security checks.
 */
export function isServerBrowser(): boolean {
  if (Platform.OS !== "web") return false;
  if (typeof window === "undefined" || !window.location) return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

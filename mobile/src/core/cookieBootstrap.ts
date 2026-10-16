import { BootstrapAuthRequiredError } from "@/lib/bootstrap";
import type { BootstrapResponse } from "@/lib/types";

/**
 * Fetch bootstrap payload using the HttpOnly session cookie.
 * Sends header `X-Nanobot-Cookie-Auth: 1` and `credentials: "same-origin"`, without any auth header.
 */
export async function fetchCookieBootstrap(
  baseUrl: string = "",
  timeoutMs: number = 10_000,
): Promise<BootstrapResponse> {
  const root = baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${root}/webui/bootstrap`, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-Nanobot-Cookie-Auth": "1",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new BootstrapAuthRequiredError(`bootstrap failed: HTTP ${res.status}`);
      }
      throw new Error(`bootstrap failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as BootstrapResponse;
    if (!body.ws_path) {
      throw new Error("bootstrap response missing ws_path");
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Revoke this browser session on the server and clear the HttpOnly cookie.
 */
export async function webLogout(baseUrl: string): Promise<void> {
  const root = baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/devices/web-logout`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "X-Nanobot-Cookie-Auth": "1",
    },
  });
  if (!res.ok && res.status !== 401 && res.status !== 403) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `logout failed: HTTP ${res.status}`);
  }
}

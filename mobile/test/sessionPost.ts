/** Stand-in for NanobotSession.post on hand-made session mocks: same request shape, through global.fetch. */
export async function sessionPost(
  this: { baseUrl: string; apiToken: () => string },
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await global.fetch(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${this.apiToken()}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "error",
    credentials: "omit",
  });
  if (!res.ok) {
    let msg = "";
    try {
      const j = (await res.json()) as { error?: unknown };
      if (typeof j?.error === "string") msg = j.error;
    } catch {}
    const err = new Error(msg || `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  // many fetch mocks are bare `{ ok: true }`
  return typeof res.json === "function" ? res.json() : {};
}

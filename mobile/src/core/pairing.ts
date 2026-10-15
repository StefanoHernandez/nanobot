import type { NanobotSession } from "./session";
import { kv } from "../platform/storage";
import { normalizeBaseUrl } from "./profiles";

export function parsePairingQr(raw: string): { url: string; code: string } | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  if (rec.v !== 1) return null;
  if (typeof rec.url !== "string" || typeof rec.code !== "string") return null;
  const code = rec.code;
  if (!code || code.length > 200 || /\s/.test(code)) return null;
  const url = normalizeBaseUrl(rec.url);
  if (!url) return null;
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    if (path) return null;
  } catch {
    return null;
  }
  return { url, code };
}

/** QR payload for the server this phone already uses. Rejects anything parsePairingQr would reject. */
export function pairingQrValue(url: string, code: string): string | null {
  const parsed = parsePairingQr(JSON.stringify({ v: 1, url, code }));
  if (!parsed) return null;
  return JSON.stringify({ v: 1, url: parsed.url, code: parsed.code });
}

/** Server allows 1–40 chars and no control characters. */
export function pairingDeviceName(input: string): string {
  const name = input.trim();
  if (!name || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) return "Telefono";
  return name;
}

const pairedKey = (profileId: string) => `pairing.device.${profileId}`;

/** The server's id for this phone, saved at pairing (not a secret: lets Settings warn before revoking itself). */
export const pairedDevice = {
  get: (profileId: string): string | null => kv.get(pairedKey(profileId)) ?? null,
  set: (profileId: string, deviceId: string): void => kv.set(pairedKey(profileId), deviceId),
  clear: (profileId: string): void => kv.del(pairedKey(profileId)),
};

export async function claimDevice(baseUrl: string, code: string, name: string): Promise<{ device_token: string; id: string | null }> {
  const root = baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/devices/claim`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) throw new Error("claim failed");
  const data = (await res.json()) as { device_token?: string; id?: string };
  if (!data.device_token) throw new Error("claim failed");
  return { device_token: data.device_token, id: typeof data.id === "string" ? data.id : null };
}

type MintResponse = { code: string; qr: string; expires_in?: number };

export async function mintPairingCode(session: NanobotSession): Promise<{ code: string; qr: string }> {
  const res = await fetch(`${session.baseUrl}/api/ext/devices/codes`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers: { Authorization: `Bearer ${session.apiToken()}` },
  });
  if (!res.ok) throw new Error("mint failed");
  const data = (await res.json()) as MintResponse;
  if (!data.code || !data.qr) throw new Error("mint failed");
  return { code: data.code, qr: data.qr };
}

export type PairedDevice = {
  id: string;
  name: string;
  created: number;
  last_seen: number | null;
  revoked: boolean;
};

export async function listDevices(session: NanobotSession): Promise<PairedDevice[]> {
  const data = await session.get<{ devices?: unknown }>("/api/ext/devices");
  if (!data || !Array.isArray(data.devices)) throw new Error("devices failed");
  const devices: PairedDevice[] = [];
  for (const row of data.devices) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.id !== "string" || !rec.id || typeof rec.name !== "string" || !rec.name) continue;
    const last = rec.last_seen;
    devices.push({
      id: rec.id,
      name: rec.name,
      created: typeof rec.created === "number" ? rec.created : 0,
      last_seen: typeof last === "number" && Number.isFinite(last) ? last : null,
      revoked: rec.revoked === true,
    });
  }
  return devices;
}

export async function revokeDevice(session: NanobotSession, id: string): Promise<void> {
  if (!id) throw new Error("revoke failed");
  const res = await fetch(`${session.baseUrl}/api/ext/devices/revoke`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${session.apiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error("revoke failed");
}

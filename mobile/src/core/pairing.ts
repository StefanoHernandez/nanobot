import type { NanobotSession } from "./session";
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

export async function claimDevice(baseUrl: string, code: string, name: string): Promise<{ device_token: string }> {
  const root = baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/devices/claim`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) throw new Error("claim failed");
  const data = (await res.json()) as { device_token?: string };
  if (!data.device_token) throw new Error("claim failed");
  return { device_token: data.device_token };
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

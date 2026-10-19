/**
 * Host checks for insecure plain http connection warning.
 * Local hosts: localhost, 127.0.0.1, ::1, 10.*, 192.168.*, 172.16-31.*, *.local
 * Tailscale: 100.64.0.0/10 (100.64.0.0 - 100.127.255.255), *.ts.net
 */
export function isLocalOrTailscaleHost(rawHost: string): boolean {
  const host = rawHost.replace(/^\[|\]$/g, "").toLowerCase().trim();
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".ts.net")) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    const c = Number(ipv4[3]);
    const d = Number(ipv4[4]);
    if (a > 255 || b > 255 || c > 255 || d > 255) return false;

    // 10.*
    if (a === 10) return true;
    // 192.168.*
    if (a === 192 && b === 168) return true;
    // 172.16-31.*
    if (a === 172 && b >= 16 && b <= 31) return true;
    // Tailscale IPv4: 100.64.0.0/10 -> second octet 64..127
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  return false;
}

/**
 * Returns true if the URL is plain http:// and its host is not local or Tailscale.
 */
export function isInsecureHttpUrl(rawUrl: string): boolean {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return false;
    const normalized = trimmed.toLowerCase().startsWith("http://") || trimmed.toLowerCase().startsWith("https://")
      ? trimmed
      : `http://${trimmed}`;
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:") return false;
    return !isLocalOrTailscaleHost(parsed.hostname);
  } catch {
    return false;
  }
}

import { i18n } from "../../../i18n";

export function parseEveryMsToUnit(everyMs: number): { amount: string; unit: "minutes" | "hours" | "days" } {
  if (typeof everyMs !== "number" || isNaN(everyMs) || everyMs <= 0) {
    return { amount: "", unit: "minutes" };
  }
  const days = everyMs / 86_400_000;
  if (days >= 1 && Number.isInteger(days)) {
    return { amount: String(days), unit: "days" };
  }
  const hours = everyMs / 3_600_000;
  if (hours >= 1 && Number.isInteger(hours)) {
    return { amount: String(hours), unit: "hours" };
  }
  const mins = everyMs / 60_000;
  if (Number.isInteger(mins)) {
    return { amount: String(mins), unit: "minutes" };
  }
  const rounded = Math.round(mins * 10000) / 10000;
  return { amount: String(rounded), unit: "minutes" };
}

export function everyUnitToMs(amountStr: string, unit: "minutes" | "hours" | "days"): number | null {
  const trimmed = amountStr.trim();
  if (!trimmed) return null;
  const num = parseFloat(trimmed);
  if (isNaN(num) || num <= 0) return null;
  if (unit === "days") return Math.round(num * 86_400_000);
  if (unit === "hours") return Math.round(num * 3_600_000);
  if (unit === "minutes") return Math.round(num * 60_000);
  return null;
}

export function formatAtLocal(atMs?: number | null, lang = "en"): string {
  if (typeof atMs !== "number" || isNaN(atMs) || atMs <= 0) return "";
  const d = new Date(atMs);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function formatAtSchedule(atMs?: number | null): string {
  return formatAtLocal(atMs, i18n.language);
}

export function parseAtSchedule(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{11,15}$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!isNaN(n) && n > 0) return n;
  }
  const timestamp = Date.parse(trimmed);
  if (!isNaN(timestamp)) {
    return timestamp;
  }
  return null;
}

export function formatEverySchedule(everyMs?: number | null): string {
  if (typeof everyMs !== "number" || isNaN(everyMs) || everyMs <= 0) return "";
  const { amount, unit } = parseEveryMsToUnit(everyMs);
  return `${amount} ${i18n.t(`automations.${unit}`)}`;
}

export function parseEverySchedule(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return null;
  const unit = match[2];
  if (["d", "day", "days", "giorni", "g"].includes(unit)) {
    return Math.round(num * 86_400_000);
  }
  if (["h", "hr", "hrs", "hour", "hours", "ore", "o"].includes(unit)) {
    return Math.round(num * 3_600_000);
  }
  if (["m", "min", "mins", "minute", "minutes", "minuti"].includes(unit)) {
    return Math.round(num * 60_000);
  }
  return null;
}

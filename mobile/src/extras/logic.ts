import type { NanobotSession } from "../core/session";

export const EFFORT_ORDER: readonly string[] = ["none", "low", "medium", "high", "xhigh", "max", "adaptive"];

const SEP = "·";

export function basePresetName(name: string): string {
  const i = name.lastIndexOf(SEP);
  if (i < 0) return name;
  return EFFORT_ORDER.includes(name.slice(i + 1)) ? name.slice(0, i) : name;
}

export function derivedPresetName(base: string, level: string): string {
  return `${base}${SEP}${level}`;
}

export function sortEfforts(values: string[]): string[] {
  const known = new Set(values.filter((v) => EFFORT_ORDER.includes(v)));
  return EFFORT_ORDER.filter((v) => known.has(v));
}

export type Cmd = { command: string; title: string; description: string; argHint?: string; acceptsArgs: boolean };
export type CmdGroup = "session" | "memory" | "agent" | "other";

const GROUPS: Record<Exclude<CmdGroup, "other">, string[]> = {
  session: ["/status", "/compact", "/history", "/stop", "/new"],
  memory: ["/dream", "/dream-log", "/dream-restore"],
  agent: ["/goal", "/restart", "/help"],
};

export function groupCommands(cmds: Cmd[]): Array<{ group: CmdGroup; items: Cmd[] }> {
  const order: CmdGroup[] = ["session", "memory", "agent", "other"];
  const buckets = new Map<CmdGroup, Cmd[]>(order.map((g) => [g, []]));
  for (const cmd of cmds) {
    const group = (Object.keys(GROUPS) as Array<keyof typeof GROUPS>).find((g) => GROUPS[g].includes(cmd.command)) ?? "other";
    buckets.get(group)!.push(cmd);
  }
  return order.filter((g) => buckets.get(g)!.length > 0).map((g) => ({ group: g, items: buckets.get(g)! }));
}

type RawCmd = { command: string; title: string; description: string; arg_hint?: string; accepts_args?: boolean };

export async function loadCommands(session: NanobotSession): Promise<Cmd[]> {
  const r = await session.get<{ commands?: RawCmd[] }>("/api/commands");
  return (r.commands ?? []).map((c) => ({
    command: c.command, title: c.title, description: c.description, argHint: c.arg_hint, acceptsArgs: !!c.accepts_args,
  }));
}

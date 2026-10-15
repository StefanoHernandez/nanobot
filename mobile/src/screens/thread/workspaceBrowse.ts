/** Folders that belong to the agent, not to a project the chat should open. */
const AGENT_HOME_DIRS = new Set(["cron", "memory", "plugins", "prompts", "skills", "triggers"]);

/** True when this directory is nanobot's own workspace root. */
export function isAgentWorkspace(path: string): boolean {
  const norm = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return norm.endsWith("/.nanobot/workspace");
}

/** Hides the agent's own folders when browsing its workspace root. */
export function browseEntries<T extends { name: string }>(path: string, entries: readonly T[]): T[] {
  if (!isAgentWorkspace(path)) return [...entries];
  return entries.filter((entry) => !AGENT_HOME_DIRS.has(entry.name));
}

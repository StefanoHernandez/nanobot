import type {
  ChatSummary,
  CliAppInfo,
  McpPresetInfo,
  OutboundCliAppMention,
  OutboundMcpPresetMention,
  SessionMention,
} from "@/lib/types";

export type SessionCandidate = ChatSummary & {
  kind: "chat";
  id: string;
  name: string;
  title: string;
  chat: ChatSummary;
};

export type CliAppCandidate = CliAppInfo & {
  kind: "app";
  title: string;
  app: CliAppInfo;
};

export type McpPresetCandidate = McpPresetInfo & {
  kind: "mcp";
  title: string;
  preset: McpPresetInfo;
};

export type MentionCandidate = SessionCandidate | CliAppCandidate | McpPresetCandidate;

export function sessionCandidates(chats: ChatSummary[]): SessionCandidate[] {
  return chats
    .filter(
      (c): c is ChatSummary & { handle: NonNullable<ChatSummary["handle"]> } =>
        Boolean(c.handle?.id && c.handle?.name),
    )
    .map((c) => ({
      ...c,
      kind: "chat" as const,
      id: c.handle.id,
      name: c.handle.name,
      title: c.title ?? "",
      chat: c,
    }));
}

export function cliAppCandidates(apps: CliAppInfo[]): CliAppCandidate[] {
  return apps
    .filter((a) => a.installed)
    .map((a) => ({
      ...a,
      kind: "app" as const,
      title: a.display_name || a.name,
      app: a,
    }));
}

export function isMcpEligible(preset: McpPresetInfo): boolean {
  if (preset.source === "agent-plugin") return false;
  return Boolean(preset.enabled ?? (preset.installed && preset.configured));
}

export function filterMcpPresets(presets: McpPresetInfo[]): McpPresetInfo[] {
  return presets.filter(isMcpEligible);
}

export const mcpCandidates = (presets: McpPresetInfo[]): McpPresetCandidate[] => {
  return filterMcpPresets(presets).map((p) => ({
    ...p,
    kind: "mcp" as const,
    title: p.display_name || p.name,
    preset: p,
  }));
};

export function filterCandidates<
  T extends { name: string; title?: string; display_name?: string },
>(all: T[], query: string): T[] {
  const q = (query.startsWith("@") ? query.slice(1) : query).toLowerCase().trim();
  if (!q) return all;
  return all.filter((item) => {
    const nameMatch = item.name.toLowerCase().includes(q);
    const titleMatch = item.title ? item.title.toLowerCase().includes(q) : false;
    const displayMatch = item.display_name
      ? item.display_name.toLowerCase().includes(q)
      : false;
    return nameMatch || titleMatch || displayMatch;
  });
}

export function toSessionMention(chat: ChatSummary): SessionMention {
  const handle = chat.handle;
  if (!handle) {
    throw new Error("Chat is not mentionable: missing handle");
  }
  return {
    id: handle.id,
    name: handle.name,
    session_key: chat.key,
    title: chat.title ?? "",
  };
}

export function toCliAppMention(app: CliAppInfo): OutboundCliAppMention {
  return {
    name: app.name,
    display_name: app.display_name,
    category: app.category,
    entry_point: app.entry_point,
    logo_url: app.logo_url ?? null,
    brand_color: app.brand_color ?? null,
  };
}

export function toMcpPresetMention(preset: McpPresetInfo): OutboundMcpPresetMention {
  return {
    name: preset.name,
    display_name: preset.display_name,
    category: preset.category,
    transport: preset.transport,
    status: preset.status,
    configured: preset.configured,
    logo_url: preset.logo_url ?? null,
    brand_color: preset.brand_color ?? null,
  };
}

export function hasMentionToken(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\s)@${escaped}(?=[\\s\\n,.!?;:]|$)`, "i");
  return regex.test(text);
}

export type PickedMentions = {
  sessionMentions?: SessionMention[];
  cliApps?: OutboundCliAppMention[];
  mcpPresets?: OutboundMcpPresetMention[];
};

export function pruneMentions<T extends { name: string }>(text: string, picked: T[]): T[];
export function pruneMentions(text: string, picked: PickedMentions): PickedMentions;
export function pruneMentions(text: string, picked: any): any {
  if (Array.isArray(picked)) {
    return picked.filter((item) => hasMentionToken(text, item.name));
  }
  return {
    sessionMentions:
      picked.sessionMentions?.filter((item: SessionMention) =>
        hasMentionToken(text, item.name),
      ) ?? [],
    cliApps:
      picked.cliApps?.filter((item: OutboundCliAppMention) =>
        hasMentionToken(text, item.name),
      ) ?? [],
    mcpPresets:
      picked.mcpPresets?.filter((item: OutboundMcpPresetMention) =>
        hasMentionToken(text, item.name),
      ) ?? [],
  };
}

export type ActiveMention = {
  query: string;
  startIndex: number;
  endIndex: number;
};

export function getActiveMention(text: string, cursor?: number): ActiveMention | null {
  const pos = cursor !== undefined && cursor >= 0 ? cursor : text.length;
  const beforeCursor = text.slice(0, pos);

  const lastWhitespace = beforeCursor.search(/\s[^\s]*$/);
  const tokenStart = lastWhitespace === -1 ? 0 : lastWhitespace + 1;
  const token = beforeCursor.slice(tokenStart);

  if (!token.startsWith("@")) {
    return null;
  }

  return {
    query: token.slice(1),
    startIndex: tokenStart,
    endIndex: pos,
  };
}

export function replaceMentionToken(
  text: string,
  name: string,
  mention: ActiveMention,
): string {
  const before = text.slice(0, mention.startIndex);
  const after = text.slice(mention.endIndex);
  return `${before}@${name} ${after}`;
}

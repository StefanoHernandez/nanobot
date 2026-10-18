import type { NanobotSession } from "../../../core/session";

export type SkillProposal = {
  name: string;
  summary: string;
  reason: string;
  source?: "chat" | "scout" | string;
  date?: string;
  created_at?: string;
  updates?: string;
  session_key?: string;
  raw_markdown?: string;
  content?: string;
  text?: string;
};

export async function fetchProposals(session: NanobotSession): Promise<SkillProposal[]> {
  try {
    const res = await session.get<{ proposals?: SkillProposal[] }>("/api/ext/skills/proposals");
    return res?.proposals ?? [];
  } catch {
    return [];
  }
}

export async function fetchProposalDetail(session: NanobotSession, name: string): Promise<SkillProposal> {
  return session.get<SkillProposal>(`/api/ext/skills/proposals/${encodeURIComponent(name)}`);
}

export async function activateProposal(session: NanobotSession, name: string): Promise<void> {
  await session.post(`/api/ext/skills/proposals/${encodeURIComponent(name)}/activate`);
}

export async function rejectProposal(session: NanobotSession, name: string): Promise<void> {
  await session.post(`/api/ext/skills/proposals/${encodeURIComponent(name)}/reject`);
}

export async function fetchScoutSettings(session: NanobotSession): Promise<{ enabled: boolean }> {
  try {
    const res = await session.get<{ enabled?: boolean }>("/api/ext/skills/scout");
    return { enabled: res?.enabled === true };
  } catch {
    return { enabled: false };
  }
}

export async function saveScoutSettings(session: NanobotSession, enabled: boolean): Promise<{ enabled: boolean }> {
  return session.post<{ enabled: boolean }>("/api/ext/skills/scout", { enabled });
}

export async function proposeFromChat(
  session: NanobotSession,
  sessionKey: string,
): Promise<{ proposal: SkillProposal | null; reason?: string }> {
  return session.post<{ proposal: SkillProposal | null; reason?: string }>("/api/ext/skills/propose", {
    session_key: sessionKey,
  });
}

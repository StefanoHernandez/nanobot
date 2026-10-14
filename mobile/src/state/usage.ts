import type { RoundUsage, UIMessage } from "@/lib/types";

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Port of upstream ThreadShell latestComposerContextUsage: last finished assistant context_tokens, reset by a successful compaction. */
export function latestContextUsage(messages: UIMessage[]): { contextTokens: number; contextWindowTokens: number | null } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === "compaction" && m.compaction?.phase === "succeeded") return null;
    const ct = m.usage?.context_tokens;
    if (m.role !== "assistant" || m.kind === "trace" || m.isStreaming || !num(ct) || ct < 0) continue;
    return { contextTokens: ct, contextWindowTokens: num(m.contextWindowTokens) ? m.contextWindowTokens : null };
  }
  return null;
}

export type RoundUsageRow = { inputTokens: number; outputTokens: number; cachedTokens: number; estimated: boolean; generationMs: number | null };

/** Port of upstream recentComposerRoundUsage: up to `max` newest rounds (one assistant message per turn), newest first. */
export function recentRoundUsage(messages: UIMessage[], max = 8): RoundUsageRow[] {
  const out: RoundUsageRow[] = [];
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0 && out.length < max; i--) {
    const m = messages[i];
    const turn = m.turnId || m.id;
    if (m.role !== "assistant" || m.kind === "trace" || m.isStreaming || seen.has(turn)) continue;
    seen.add(turn);
    const rounds: RoundUsage[] = m.roundUsages ?? [];
    for (let r = rounds.length - 1; r >= 0 && out.length < max; r--) {
      const u = rounds[r];
      if (!num(u.prompt_tokens) || u.prompt_tokens <= 0) continue;
      out.push({
        inputTokens: u.prompt_tokens,
        outputTokens: num(u.completion_tokens) ? u.completion_tokens : 0,
        cachedTokens: num(u.cached_tokens) ? u.cached_tokens : 0,
        estimated: num(u.estimated_tokens) && u.estimated_tokens > 0,
        generationMs: num(u.generation_ms) ? u.generation_ms : null,
      });
    }
  }
  return out;
}

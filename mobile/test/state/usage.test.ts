import { latestContextUsage, recentRoundUsage } from "../../src/state/usage";

const asst = (id: string, extra: object = {}): any => ({ id, role: "assistant", content: "", ...extra });

test("latestContextUsage returns last finished assistant context_tokens", () => {
  const msgs = [
    asst("a", { usage: { context_tokens: 10 } }),
    asst("b", { usage: { context_tokens: 50 }, contextWindowTokens: 1000 }),
    asst("c", { usage: { context_tokens: 99 }, isStreaming: true }),
    asst("t", { kind: "trace", usage: { context_tokens: 77 } }),
  ];
  expect(latestContextUsage(msgs)).toEqual({ contextTokens: 50, contextWindowTokens: 1000 });
  expect(latestContextUsage([asst("a", { usage: { context_tokens: 3 } })])).toEqual({ contextTokens: 3, contextWindowTokens: null });
});

test("latestContextUsage stops at a successful compaction", () => {
  const msgs = [asst("a", { usage: { context_tokens: 10 } }), { id: "c", role: "assistant", kind: "compaction", compaction: { phase: "succeeded" } }];
  expect(latestContextUsage(msgs as any)).toBeNull();
  const failed = [asst("a", { usage: { context_tokens: 10 } }), { id: "c", role: "assistant", kind: "compaction", compaction: { phase: "failed" } }];
  expect(latestContextUsage(failed as any)?.contextTokens).toBe(10);
});

test("recentRoundUsage caps at 8 rounds, newest first, skips zero input", () => {
  const rounds = (n: number, base: number) =>
    Array.from({ length: n }, (_, i) => ({ prompt_tokens: base + i, completion_tokens: 2, cached_tokens: 1, generation_ms: 5 }));
  const msgs = [
    asst("a", { turnId: "t1", roundUsages: rounds(6, 100) }),
    asst("b", { turnId: "t2", roundUsages: [{ prompt_tokens: 0 }, ...rounds(5, 200), { prompt_tokens: 300, estimated_tokens: 4 }] }),
  ];
  const out = recentRoundUsage(msgs);
  expect(out).toHaveLength(8);
  expect(out[0]).toEqual({ inputTokens: 300, outputTokens: 0, cachedTokens: 0, estimated: true, generationMs: null });
  expect(out[1].inputTokens).toBe(204);
  expect(out[6].inputTokens).toBe(105); // t1 newest round after t2's 6
  expect(recentRoundUsage(msgs, 2)).toHaveLength(2);
});

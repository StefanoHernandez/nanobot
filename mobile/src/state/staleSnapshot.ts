// Ported verbatim in behaviour from WebUI ThreadShell.tsx:80-114, 188-329 (isStaleThreadSnapshot and helpers).
import type { UIMessage } from "@/lib/types";

type Shape = Pick<UIMessage, "role" | "kind" | "content" | "isStreaming" | "turnId">;

const same = (a: Shape, b: Shape) =>
  a.role === b.role && (a.kind ?? "") === (b.kind ?? "") && a.content === b.content && (!a.turnId || !b.turnId || a.turnId === b.turnId);

function preservesOne(cur: Shape, cand: Shape, allowReplace: boolean): boolean {
  if (same(cur, cand)) return true;
  if (allowReplace && cur.role === "assistant" && cand.role === cur.role && (cand.kind ?? "") === (cur.kind ?? "") && !!cur.turnId && cand.turnId === cur.turnId) return true;
  return (
    cur.role === "assistant" && cur.isStreaming === true && cand.role === cur.role && (cand.kind ?? "") === (cur.kind ?? "") &&
    (!cur.turnId || !cand.turnId || cand.turnId === cur.turnId) && cand.content.startsWith(cur.content)
  );
}

function shape(m: UIMessage): Shape | null {
  if (m.kind === "trace") return null;
  if (m.role !== "user" && m.role !== "assistant") return null;
  if (m.role === "assistant" && !m.content.trim() && !m.media?.length) return null;
  return { role: m.role, kind: m.kind, content: m.content, isStreaming: m.isStreaming, turnId: m.turnId };
}
const shapes = (ms: UIMessage[]) => ms.map(shape).filter((s): s is Shape => s !== null);

function preservesShapes(expected: Shape[], candidates: Shape[], allowReplace: boolean): boolean {
  let cursor = 0;
  let prev: Shape | null = null;
  for (const m of expected) {
    if (allowReplace && prev?.role === "assistant" && m.role === "assistant" && !!m.turnId && m.turnId === prev.turnId) continue;
    let found = false;
    while (cursor < candidates.length) {
      const c = candidates[cursor++];
      if (preservesOne(m, c, allowReplace)) {
        found = true;
        prev = c;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/** True when `snapshot` would drop durable messages already shown in `current`. */
export function isStaleThreadSnapshot(current: UIMessage[], snapshot: UIMessage[], allowCompletedTurnReplacement = false): boolean {
  if (current.length === 0) return false;
  if (snapshot.length === 0) return true;
  const expected = shapes(current);
  if (expected.length > 0 && !preservesShapes(expected, shapes(snapshot), allowCompletedTurnReplacement)) return true;
  if (snapshot.length >= current.length) return false;
  if (allowCompletedTurnReplacement) return false;
  return snapshot.every((m, i) => same(current[i] as Shape, m as Shape));
}

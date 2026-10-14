export type DiffLineKind = "add" | "del" | "ctx" | "hunk" | "meta";

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
};

/**
 * Parses a unified diff string into tagged lines.
 *
 * Rules:
 * - Lines starting with "@@" become "hunk"
 * - "diff ", "\\ No newline..." and, before the first "@@" of a file, "+++", "---", "index " become "meta"
 * - Inside a hunk, "+"/"-" lines are add/del even if the text starts with "++"/"--"
 * - The trailing empty line from split("\n") is dropped
 * - Lines starting with "+" become "add" (with leading '+' stripped)
 * - Lines starting with "-" become "del" (with leading '-' stripped)
 * - Other lines become "ctx" (with leading char stripped if line is non-empty)
 */
export function parseUnifiedDiff(text: string): DiffLine[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const result: DiffLine[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true;
      result.push({ kind: "hunk", text: line });
    } else if (line.startsWith("\\")) {
      result.push({ kind: "meta", text: line });
    } else if (line.startsWith("diff ")) {
      inHunk = false;
      result.push({ kind: "meta", text: line });
    } else if (!inHunk && (line.startsWith("+++") || line.startsWith("---") || line.startsWith("index "))) {
      result.push({ kind: "meta", text: line });
    } else if (line.startsWith("+")) {
      result.push({ kind: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      result.push({ kind: "del", text: line.slice(1) });
    } else {
      // ctx: strip first char if present (usually a space in unified diffs)
      result.push({ kind: "ctx", text: line.length > 0 ? line.slice(1) : "" });
    }
  }

  return result;
}

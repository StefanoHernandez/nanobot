export type ArtifactFixInput = {
  id?: string;
  kind: string;
  /** Zero-based version index. Omitted when there is only one version. */
  index?: number;
  total?: number;
  error?: string;
  line?: number;
  /** User's change request. When set, this is "Chiedi modifica", not "Correggi". */
  request?: string;
};

/** Italian note sent back to the chat. Never includes the artifact source. */
export function artifactFixText(input: ArtifactFixInput): string {
  const kind = input.kind.trim() || "html";
  const who = input.id ? `\`${input.id}\` (${kind})` : kind;
  const version = input.total != null && input.total > 1 && input.index != null ? `, versione ${input.index + 1}` : "";
  const request = input.request?.trim();
  if (request) return `Modifica l'artefatto ${who}${version}.\nRichiesta: ${request}`;
  const line = input.line != null && input.line > 0 ? ` (riga ${input.line})` : "";
  const error = input.error?.trim();
  const detail = error ? `Errore: ${error}${line}` : "Non si apre nell'anteprima.";
  return `Correggi l'artefatto ${who}${version}.\n${detail}`;
}

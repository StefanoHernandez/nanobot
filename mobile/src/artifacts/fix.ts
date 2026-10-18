import { i18n } from "../i18n";

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
  lang?: "it" | "en";
};

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A fence id the bot can reuse. The kind is kept only when it is already a safe token. */
export function freshArtifactId(kind: string): string {
  const prefix = /^[a-z0-9]+$/.test(kind) ? kind : "html";
  let body = "";
  for (let i = 0; i < 8; i++) body += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return `${prefix}-${body}`;
}

/** The line the preview sends so the next block stays the same artifact. */
export function artifactClaimLine(kind: string, id: string, lang?: "it" | "en"): string {
  const isEn = (lang ?? (i18n.language?.startsWith("en") ? "en" : "it")) === "en";
  if (isEn) {
    return `Same first line, not a new artifact: \`${kind} id=${id}\`.`;
  }
  return `Stessa prima riga, non un artefatto nuovo: \`${kind} id=${id}\`.`;
}

/** Note sent back to the chat. Never includes the artifact source. */
export function artifactFixText(input: ArtifactFixInput, lang?: "it" | "en"): string {
  const chosenLang = input.lang ?? lang ?? (i18n.language?.startsWith("en") ? "en" : "it");
  const isEn = chosenLang === "en";
  const kind = input.kind.trim() || "html";
  const id = input.id?.trim();
  const who = id ? `\`${id}\` (${kind})` : kind;
  const version =
    input.total != null && input.total > 1 && input.index != null
      ? isEn
        ? `, version ${input.index + 1}`
        : `, versione ${input.index + 1}`
      : "";
  const claim = id
    ? artifactClaimLine(kind, id, isEn ? "en" : "it")
    : isEn
      ? "Do not create a new artifact."
      : "Non creare un artefatto nuovo.";
  const request = input.request?.trim();
  if (request) {
    if (isEn) {
      return `Modify the artifact ${who}${version}.\n${claim}\nRequest: ${request}`;
    }
    return `Modifica l'artefatto ${who}${version}.\n${claim}\nRichiesta: ${request}`;
  }
  const line =
    input.line != null && input.line > 0
      ? isEn
        ? ` (line ${input.line})`
        : ` (riga ${input.line})`
      : "";
  const error = input.error?.trim();
  const detail = error
    ? isEn
      ? `Error: ${error}${line}`
      : `Errore: ${error}${line}`
    : isEn
      ? "Does not open in preview."
      : "Non si apre nell'anteprima.";
  if (isEn) {
    return `Fix the artifact ${who}${version}.\n${claim}\n${detail}`;
  }
  return `Correggi l'artefatto ${who}${version}.\n${claim}\n${detail}`;
}

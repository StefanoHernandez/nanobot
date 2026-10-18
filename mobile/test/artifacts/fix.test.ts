import { artifactFixText, freshArtifactId } from "../../src/artifacts/fix";
import { i18n } from "../../src/i18n";

const SOURCE = "<script>SECRET SOURCE</script>";

beforeEach(() => {
  i18n.changeLanguage("it");
});

test("a fix names the artifact and the error, never the source", () => {
  const text = artifactFixText({ id: "sales-dashboard", kind: "html", error: "Unexpected token", line: 4 });
  expect(text).toBe(
    "Correggi l'artefatto `sales-dashboard` (html).\nStessa prima riga, non un artefatto nuovo: `html id=sales-dashboard`.\nErrore: Unexpected token (riga 4)",
  );
  expect(text).not.toContain(SOURCE);
});

test("a fix without an id or an error stays short", () => {
  expect(artifactFixText({ kind: "svg" })).toBe(
    "Correggi l'artefatto svg.\nNon creare un artefatto nuovo.\nNon si apre nell'anteprima.",
  );
});

test("a change request names the version and the request", () => {
  expect(artifactFixText({ id: "map", kind: "mermaid", index: 1, total: 3, request: " più grande " })).toBe(
    "Modifica l'artefatto `map` (mermaid), versione 2.\nStessa prima riga, non un artefatto nuovo: `mermaid id=map`.\nRichiesta: più grande",
  );
});

test("English fix text outputs English copy with the same structural claim format", () => {
  const text = artifactFixText(
    { id: "sales-dashboard", kind: "html", error: "Unexpected token", line: 4 },
    "en",
  );
  expect(text).toBe(
    "Fix the artifact `sales-dashboard` (html).\nSame first line, not a new artifact: `html id=sales-dashboard`.\nError: Unexpected token (line 4)",
  );
  expect(text).not.toContain(SOURCE);

  const shortText = artifactFixText({ kind: "svg" }, "en");
  expect(shortText).toBe(
    "Fix the artifact svg.\nDo not create a new artifact.\nDoes not open in preview.",
  );

  const reqText = artifactFixText(
    { id: "map", kind: "mermaid", index: 1, total: 3, request: "make it bigger" },
    "en",
  );
  expect(reqText).toBe(
    "Modify the artifact `map` (mermaid), version 2.\nSame first line, not a new artifact: `mermaid id=map`.\nRequest: make it bigger",
  );
});

test("a fresh id is safe to put on a fence", () => {
  expect(freshArtifactId("svg")).toMatch(/^svg-[a-z0-9]{8}$/);
  expect(freshArtifactId("../svg")).toMatch(/^html-[a-z0-9]{8}$/);
});

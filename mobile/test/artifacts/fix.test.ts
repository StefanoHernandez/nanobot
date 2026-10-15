import { artifactFixText, freshArtifactId } from "../../src/artifacts/fix";

const SOURCE = "<script>SECRET SOURCE</script>";

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

test("a fresh id is safe to put on a fence", () => {
  expect(freshArtifactId("svg")).toMatch(/^svg-[a-z0-9]{8}$/);
  expect(freshArtifactId("../svg")).toMatch(/^html-[a-z0-9]{8}$/);
});

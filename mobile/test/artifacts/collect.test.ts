import { collectArtifacts, locateVersion, parseFenceInfo } from "../../src/artifacts/collect";

const msg = (id: string, content: string) => ({ id, content });

test("parseFenceInfo reads the language, a safe id and a quoted title", () => {
  expect(parseFenceInfo('HTML id=Sales-Dashboard title="Vendite Q3"')).toEqual({
    lang: "html",
    id: "sales-dashboard",
    title: "Vendite Q3",
  });
  expect(parseFenceInfo("python")).toEqual({ lang: "python" });
  expect(parseFenceInfo('svg id="../etc" title="x"').id).toBeUndefined();
  expect(parseFenceInfo("mermaid id=a").id).toBeUndefined();
});

test("the same id across messages is one artifact with versions in order", () => {
  const artifacts = collectArtifacts([
    msg("m1", '```html id=dash title="Uno"\n<h1>1</h1>\n```\n'),
    msg("m2", "```python\nprint(1)\n```\n"),
    msg("m3", '```html id=dash title="Due"\n<h1>2</h1>\n```\n\n```svg\n<svg></svg>\n```\n'),
  ]);
  expect(artifacts.map((a) => a.id)).toEqual(["dash", "solo-1"]);
  expect(artifacts[0].explicit).toBe(true);
  expect(artifacts[0].title).toBe("Due");
  expect(artifacts[0].versions.map((v) => v.code)).toEqual(["<h1>1</h1>", "<h1>2</h1>"]);
  expect(artifacts[0].versions.map((v) => v.messageId)).toEqual(["m1", "m3"]);
  expect(artifacts[1].explicit).toBe(false);
  expect(artifacts[1].versions[0].kind).toBe("svg");
});

const claim = (kind: string, id: string) =>
  `Modifica l'artefatto ${kind}.\nStessa prima riga, non un artefatto nuovo: \`${kind} id=${id}\`.\nRichiesta: più grande`;

test("a modify note versions the previous svg even when the reply forgets the id", () => {
  const artifacts = collectArtifacts([
    msg("m1", "```svg\n<svg>1</svg>\n```"),
    msg("m2", claim("svg", "svg-ab12cd34")),
    msg("m3", "Ecco."),
    msg("m4", "```svg\n<svg>2</svg>\n```"),
  ]);
  expect(artifacts).toHaveLength(1);
  expect(artifacts[0].id).toBe("svg-ab12cd34");
  expect(artifacts[0].explicit).toBe(true);
  expect(artifacts[0].versions.map((v) => v.code)).toEqual(["<svg>1</svg>", "<svg>2</svg>"]);
});

test("a modify note does not pull in a different kind", () => {
  const artifacts = collectArtifacts([
    msg("m1", "```html\n<p>1</p>\n```"),
    msg("m2", claim("svg", "svg-ab12cd34")),
    msg("m3", "```svg id=svg-ab12cd34\n<svg></svg>\n```"),
  ]);
  expect(artifacts.map((a) => a.id)).toEqual(["solo-1", "svg-ab12cd34"]);
  expect(artifacts[0].explicit).toBe(false);
  expect(artifacts[1].versions).toHaveLength(1);
});

test("locateVersion opens the copy the user tapped", () => {
  const artifacts = collectArtifacts([
    msg("m1", "```html id=dash\n<h1>1</h1>\n```"),
    msg("m2", "```html id=dash\n<h1>2</h1>\n```"),
  ]);
  expect(locateVersion(artifacts, { id: "dash", code: "<h1>1</h1>", messageId: "m1" })?.index).toBe(0);
  expect(locateVersion(artifacts, { id: "dash", code: "<h1>2</h1>\n", messageId: "m2" })?.index).toBe(1);
  expect(locateVersion(artifacts, { code: "<h1>1</h1>" })).toBeNull();
});

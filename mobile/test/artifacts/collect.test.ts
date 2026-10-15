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

test("locateVersion opens the copy the user tapped", () => {
  const artifacts = collectArtifacts([
    msg("m1", "```html id=dash\n<h1>1</h1>\n```"),
    msg("m2", "```html id=dash\n<h1>2</h1>\n```"),
  ]);
  expect(locateVersion(artifacts, { id: "dash", code: "<h1>1</h1>", messageId: "m1" })?.index).toBe(0);
  expect(locateVersion(artifacts, { id: "dash", code: "<h1>2</h1>\n", messageId: "m2" })?.index).toBe(1);
  expect(locateVersion(artifacts, { code: "<h1>1</h1>" })).toBeNull();
});

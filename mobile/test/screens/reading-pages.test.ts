import { markdownToPrintHtml, paginateMarkdown } from "../../src/screens/viewer/readingPages";

test("paginateMarkdown splits on h1–h3 headings and keeps preamble", () => {
  const md = "Intro line\n\n## First\n\nBody one\n\n## Second\n\nBody two";
  const pages = paginateMarkdown(md);
  expect(pages).toHaveLength(3);
  expect(pages[0]).toContain("Intro line");
  expect(pages[1]).toMatch(/^## First/);
  expect(pages[2]).toMatch(/^## Second/);
  expect(pages.join("\n\n")).toContain("Body one");
  expect(pages.join("\n\n")).toContain("Body two");
});

test("paginateMarkdown splits long sections on blank lines without dropping text", () => {
  const blockA = "a".repeat(1500);
  const blockB = "b".repeat(1500);
  const md = `## Long\n\n${blockA}\n\n${blockB}`;
  const pages = paginateMarkdown(md);
  expect(pages.length).toBeGreaterThan(1);
  const joined = pages.join("");
  expect(joined).toContain(blockA);
  expect(joined).toContain(blockB);
  for (const page of pages) {
    expect(page.length).toBeLessThanOrEqual(2400);
  }
});

test("paginateMarkdown does not split on a heading inside a fence", () => {
  const md = "## Outside\n\n```\n## Not a heading\n```\n\n## Next\n\nAfter";
  const pages = paginateMarkdown(md);
  expect(pages).toHaveLength(2);
  expect(pages[0]).toContain("## Not a heading");
  expect(pages[1]).toMatch(/^## Next/);
});

test("paginateMarkdown blank document is one empty page", () => {
  expect(paginateMarkdown("")).toEqual([""]);
  expect(paginateMarkdown("   \n  ")).toEqual([""]);
});

test("markdownToPrintHtml renders headings and strips script tags", () => {
  const html = markdownToPrintHtml("# Title\n\n<script>alert(1)</script>\n\nSafe");
  expect(html).toContain("<!DOCTYPE html>");
  expect(html.toLowerCase()).toContain("<h1");
  expect(html.toLowerCase()).not.toMatch(/<script\b/i);
});

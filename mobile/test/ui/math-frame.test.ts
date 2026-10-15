import { mathFrameProps } from "../../src/ui/markdown/mathFrame";

test("a formula frame has no scripts and is not the page origin", () => {
  const frame = mathFrameProps("<p>x</p>", "x^2");
  expect(frame.sandbox).toBe("");
  expect(frame.srcDoc).toBe("<p>x</p>");
  expect(frame.sandbox).not.toContain("allow-scripts");
  expect(frame.sandbox).not.toContain("allow-same-origin");
  expect(frame.height).toBeGreaterThan(0);
});

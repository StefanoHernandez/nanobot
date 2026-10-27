const written: unknown[][] = [];
jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({ create: jest.fn() })),
  File: jest.fn(() => ({
    write: (...args: unknown[]) => {
      written.push(args);
    },
    uri: "file:///cache/artifacts/preview.png",
  })),
  Paths: { cache: { uri: "file:///cache" } },
}));

import { pngBase64, printDocument, writePng, writePreview } from "../../src/screens/viewer/exportArtifact";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

test("a PNG data URL is accepted and anything else is refused", () => {
  expect(pngBase64(PNG)).toBe("iVBORw0KGgo=");
  expect(pngBase64("https://evil.example/x.png")).toBeNull();
  expect(pngBase64("data:image/svg+xml;base64,iVBORw0KGgo=")).toBeNull();
  expect(pngBase64("data:image/png;base64,not base64!!")).toBeNull();
  expect(pngBase64(`${PNG}${"A".repeat(8_000_000)}`)).toBeNull();
});

test("a validated PNG is written into the cache and nothing else is", () => {
  written.length = 0;
  expect(writePng(PNG)).toBe("file:///cache/artifacts/preview.png");
  expect(written[0]).toEqual(["iVBORw0KGgo=", { encoding: "base64" }]);
  expect(writePng("https://evil.example/x.png")).toBeNull();
  expect(written).toHaveLength(1);
});

test("an in-memory preview is written only for a safe preview name", () => {
  written.length = 0;
  expect(writePreview("preview.svg", "<svg></svg>")).toBe("file:///cache/artifacts/preview.png");
  expect(written[0]).toEqual(["<svg></svg>"]);
  expect(writePreview("../preview.svg", "<svg></svg>")).toBeNull();
  expect(writePreview("preview.html", "")).toBeNull();
  expect(writePreview("preview.vl", '{"mark":"bar"}')).toBe("file:///cache/artifacts/preview.png");
  expect(written).toHaveLength(2);
});

test("print wraps a fragment and injects CSP into a full document", () => {
  expect(printDocument("<svg></svg>")).toContain("<!DOCTYPE html>");
  expect(printDocument("<svg></svg>")).toContain("<svg></svg>");
  const full = "<!DOCTYPE html><html><body>già</body></html>";
  expect(printDocument(full)).toContain("<head><meta http-equiv=\"Content-Security-Policy\"");
  expect(printDocument(full)).toContain("<body>già</body>");
});

test("printDocument injects theme CSS variables and base stylesheet for light and dark", () => {
  const lightHtml = printDocument("<p>Test</p>", { isDark: false });
  expect(lightHtml).toContain("--nb-bg:");
  expect(lightHtml).toContain("--nb-fg:");
  expect(lightHtml).toContain("--nb-card:");
  expect(lightHtml).toContain("--nb-primary:");
  expect(lightHtml).toContain(".nb-card");
  expect(lightHtml).toMatch(/#f7f7f9/i); // light background

  const darkHtml = printDocument("<p>Test</p>", { isDark: true });
  expect(darkHtml).toContain("--nb-bg:");
  expect(darkHtml).toMatch(/#0a0a0c/i); // dark background
});

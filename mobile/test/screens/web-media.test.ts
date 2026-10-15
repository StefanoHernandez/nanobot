import { openWebUrl } from "../../src/screens/thread/media/mediaCore";
import { downloadMedia, openLocal } from "../../src/screens/thread/media/media.web";
import { voiceAvailable } from "../../src/extras/voice.web";

test("the browser opens an https file and refuses anything else", () => {
  const opened: string[] = [];
  openWebUrl("https://myhost.example-tailnet.ts.net/file.pdf", (url) => opened.push(url));
  expect(opened).toEqual(["https://myhost.example-tailnet.ts.net/file.pdf"]);
  expect(() => openWebUrl("javascript:alert(1)", () => {})).toThrow("refused");
  expect(() => openWebUrl("file:///secret", () => {})).toThrow("refused");
});

test("web download keeps the https URL and does not accept other schemes", async () => {
  await expect(downloadMedia("https://h/a.png", "a.png")).resolves.toBe("https://h/a.png");
  await expect(downloadMedia("file:///a.png", "a.png")).rejects.toThrow("refused");
  const opened: string[] = [];
  const real = window.open;
  window.open = ((url?: string | URL) => {
    opened.push(String(url));
    return null;
  }) as typeof window.open;
  try {
    await openLocal("https://h/a.png", "png");
  } finally {
    window.open = real;
  }
  expect(opened).toEqual(["https://h/a.png"]);
});

test("the browser does not record voice", () => {
  expect(voiceAvailable({ transcription: { enabled: true, provider_configured: true, provider: "openai" } })).toBe(false);
});

import { uuidFrom } from "../../src/platform/polyfills";

test("uuidFrom builds an RFC 4122 v4 UUID (used on plain-http pages, which lack crypto.randomUUID)", () => {
  const id = uuidFrom(new Uint8Array(16).fill(0xff));
  expect(id).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  expect(uuidFrom(new Uint8Array(16))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

/// <reference types="node" />
import { readFileSync } from "fs";
import { join } from "path";
import { VENDOR_COMMIT, VENDOR_DATE } from "../src/platform/vendorVersion";

test("vendorVersion matches vendor/nanobot/VERSION", () => {
  const v = readFileSync(join(__dirname, "../vendor/nanobot/VERSION"), "utf8");
  expect(v).toContain(`commit: ${VENDOR_COMMIT}`);
  expect(v).toMatch(new RegExp(`date: ${VENDOR_DATE}`));
});

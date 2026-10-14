import "../src/platform/install";
import { createKv } from "../src/platform/storage";
import { kv } from "../src/platform/storage";
import { VENDOR_SECRET_KEY } from "../src/platform/polyfills";

test("createKv throws outside jest when MMKV is unavailable", () => {
  const boom = () => {
    throw new Error("no nitro");
  };
  expect(() => createKv(boom, false)).toThrow(/MMKV unavailable/);
  expect(() => createKv(boom, true)).not.toThrow();
});

test("localStorage shim never persists the vendor bootstrap secret", () => {
  localStorage.setItem(VENDOR_SECRET_KEY, "x");
  expect(VENDOR_SECRET_KEY).toBe("nanobot-webui.bootstrap-secret");
  expect(localStorage.getItem(VENDOR_SECRET_KEY)).toBeNull();
  expect(kv.keys()).not.toContain(VENDOR_SECRET_KEY);
  localStorage.setItem("other", "y");
  expect(localStorage.getItem("other")).toBe("y");
});

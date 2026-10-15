import { shouldRedirectToConnect } from "../../src/state/SessionProvider";

test("redirects to connect when the navigator is ready and no profile is open", () => {
  expect(shouldRedirectToConnect({ needsConnect: true, navReady: true, pathname: "/" })).toBe(true);
  expect(shouldRedirectToConnect({ needsConnect: true, navReady: true, pathname: "/settings" })).toBe(true);
});

test("does not redirect before the navigator is ready, or when already on connect", () => {
  expect(shouldRedirectToConnect({ needsConnect: true, navReady: false, pathname: "/" })).toBe(false);
  expect(shouldRedirectToConnect({ needsConnect: true, navReady: true, pathname: "/connect" })).toBe(false);
  expect(shouldRedirectToConnect({ needsConnect: true, navReady: true, pathname: "/connect?reason=auth" })).toBe(false);
  expect(shouldRedirectToConnect({ needsConnect: false, navReady: true, pathname: "/" })).toBe(false);
});

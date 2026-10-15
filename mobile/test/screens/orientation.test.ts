jest.mock("expo-screen-orientation", () => ({
  OrientationLock: { LANDSCAPE: "LANDSCAPE", PORTRAIT_UP: "PORTRAIT_UP" },
  lockAsync: jest.fn(async () => {}),
}));

import { lockViewer } from "../../src/screens/viewer/orientation";
import * as ScreenOrientation from "expo-screen-orientation";

test("the viewer locks landscape and the rest of the app stays portrait", async () => {
  await lockViewer(true);
  await lockViewer(false);
  expect(ScreenOrientation.lockAsync).toHaveBeenNthCalledWith(1, "LANDSCAPE");
  expect(ScreenOrientation.lockAsync).toHaveBeenNthCalledWith(2, "PORTRAIT_UP");
});

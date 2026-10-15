import * as ScreenOrientation from "expo-screen-orientation";

/** Landscape while the viewer asks for it. Portrait is the rest of the app. */
export function lockViewer(wide: boolean): Promise<void> {
  const lock = wide ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP;
  return ScreenOrientation.lockAsync(lock);
}

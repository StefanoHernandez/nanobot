import { NativeModules, Platform } from "react-native";

export interface KeepAliveNative {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
}

const native = NativeModules.KeepAlive;

export const keepAlive: KeepAliveNative = {
  start: async () => {
    if (Platform.OS === "android" && native?.start) {
      await native.start();
    }
  },
  stop: async () => {
    if (Platform.OS === "android" && native?.stop) {
      await native.stop();
    }
  },
  isRunning: async () => {
    if (Platform.OS === "android" && native?.isRunning) {
      return await native.isRunning();
    }
    return false;
  },
  isIgnoringBatteryOptimizations: async () => {
    if (Platform.OS === "android" && native?.isIgnoringBatteryOptimizations) {
      return await native.isIgnoringBatteryOptimizations();
    }
    return true;
  },
};

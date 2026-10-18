import type { KeepAliveNative } from "./keepAlive";

export type { KeepAliveNative };

export const keepAlive: KeepAliveNative = {
  start: async () => {},
  stop: async () => {},
  isRunning: async () => false,
  isIgnoringBatteryOptimizations: async () => true,
};

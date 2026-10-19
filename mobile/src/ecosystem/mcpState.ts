import type { McpPresetInfo } from "@/lib/types";

/** On/off as the server reports it: plugin rows carry `enabled`; presets and custom servers are on once installed and configured (as in the WebUI). */
export const mcpIsOn = (p: McpPresetInfo): boolean => p.enabled ?? (p.installed && p.configured);
/** Only plugin rows can be switched off in place; a preset or custom server is turned off by removing it. */
export const mcpToggleable = (p: McpPresetInfo): boolean => p.enabled !== undefined;

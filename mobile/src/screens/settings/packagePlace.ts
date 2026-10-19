import type { NanobotFeatureInfo } from "@/lib/types";

export type PackagePlace = "models" | "features" | "advanced";

export const PACKAGE_PLACE: Record<string, PackagePlace> = {
  azure: "models",
  bedrock: "models",
  olostep: "features",
  documents: "features",
  pdf: "features",
  api: "advanced",
  langfuse: "advanced",
};

/**
 * Returns which section an optional package belongs to.
 * - 'dev' is hidden (returns null).
 * - Names in PACKAGE_PLACE map to models, features, or advanced.
 * - Any other unknown package falls into 'advanced'.
 */
export function getPackagePlace(name: string): PackagePlace | null {
  if (name === "dev") return null;
  return PACKAGE_PLACE[name] ?? "advanced";
}

/**
 * Checks if a feature should be displayed in settings.
 */
export type SettingsFeatureLike = {
  name: string;
  type?: string;
  settings_visible?: boolean;
};

export function isSettingsFeatureVisible(f: SettingsFeatureLike): boolean {
  if (f.type === "channel") return false;
  if (f.settings_visible === false) return false;
  if (f.name === "dev") return false;
  return true;
}

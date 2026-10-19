import React, { useEffect } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";
import { SETTINGS_REDIRECTS } from "../../src/screens/settings/SettingsScreen";

export default function SettingsSectionRoute() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const raw = section ?? "";
  const target = SETTINGS_REDIRECTS[raw];

  useEffect(() => {
    if (target) {
      router.replace(`/settings/${target}` as never);
    }
  }, [target]);

  return <SettingsSection section={raw} />;
}

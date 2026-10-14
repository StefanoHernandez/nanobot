import { useLocalSearchParams } from "expo-router";
import { SettingsSection } from "../../src/screens/settings/SettingsSection";

export default function SettingsSectionRoute() {
  const { section } = useLocalSearchParams<{ section: string }>();
  return <SettingsSection section={section ?? ""} />;
}

import { useFonts } from "expo-font";

const FONTS = {
  Geist_400Regular: require("@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf"),
  Geist_500Medium: require("@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf"),
  Geist_600SemiBold: require("@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf"),
  GeistMono_400Regular: require("@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf"),
};

export function NativeIntegrations() {
  useFonts(FONTS);
  return null;
}

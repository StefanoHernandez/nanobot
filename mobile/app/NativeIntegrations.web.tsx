import { useFonts } from "expo-font";

// Native embeds these at build time (expo-font config plugin in app.json); a browser has to fetch them.
const FONTS = {
  AtkinsonHyperlegible_400Regular: require("@expo-google-fonts/atkinson-hyperlegible/400Regular/AtkinsonHyperlegible_400Regular.ttf"),
  AtkinsonHyperlegible_700Bold: require("@expo-google-fonts/atkinson-hyperlegible/700Bold/AtkinsonHyperlegible_700Bold.ttf"),
  BricolageGrotesque_700Bold: require("@expo-google-fonts/bricolage-grotesque/700Bold/BricolageGrotesque_700Bold.ttf"),
  BricolageGrotesque_800ExtraBold: require("@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"),
};

export function NativeIntegrations() {
  useFonts(FONTS);
  return null;
}

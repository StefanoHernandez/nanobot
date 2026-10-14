import { router, useLocalSearchParams } from "expo-router";
import { ThreadScreen } from "../../../src/screens/thread/ThreadScreen";

export default function ChatRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <ThreadScreen chatKey={key} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}

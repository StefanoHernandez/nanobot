import { router, useLocalSearchParams } from "expo-router";
import { SubagentThreadScreen } from "../../../src/screens/thread/SubagentThreadScreen";

export default function SubagentRoute() {
  const { key, id } = useLocalSearchParams<{ key: string; id: string }>();
  return <SubagentThreadScreen chatKey={key} taskId={id} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}

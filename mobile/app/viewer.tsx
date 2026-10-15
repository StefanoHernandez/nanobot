import React from "react";
import { useLocalSearchParams } from "expo-router";
import { FileViewer } from "../src/screens/viewer/FileViewer";

export default function ViewerRoute() {
  const { uri, name, chat } = useLocalSearchParams<{ uri?: string; name?: string; chat?: string }>();
  const chatKey = typeof chat === "string" ? chat : "";

  return <FileViewer uri={uri ?? ""} name={name ?? ""} chatKey={chatKey} />;
}

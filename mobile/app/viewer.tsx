import React from "react";
import { useLocalSearchParams } from "expo-router";
import { FileViewer } from "../src/screens/viewer/FileViewer";

export default function ViewerRoute() {
  const { uri, name } = useLocalSearchParams<{ uri: string; name: string }>();

  return <FileViewer uri={uri ?? ""} name={name ?? ""} />;
}

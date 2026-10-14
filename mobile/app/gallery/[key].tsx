import React from "react";
import { useLocalSearchParams } from "expo-router";
import { GalleryScreen } from "../../src/screens/gallery/GalleryScreen";

export default function GalleryRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <GalleryScreen chatKey={key ?? ""} />;
}

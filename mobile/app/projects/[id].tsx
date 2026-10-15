import React from "react";
import { useLocalSearchParams } from "expo-router";
import { ProjectDetailScreen } from "../../src/screens/projects/ProjectDetailScreen";

export default function ProjectDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProjectDetailScreen id={id || ""} />;
}

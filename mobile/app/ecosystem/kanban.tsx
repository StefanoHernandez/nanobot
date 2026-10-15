import React from "react";
import { KanbanScreen } from "../../src/screens/ecosystem/kanban/KanbanScreen";
import { useSession } from "../../src/state/sessionStore";

export default function KanbanRoute() {
  const { session } = useSession();
  if (!session) return null;
  return <KanbanScreen session={session} />;
}

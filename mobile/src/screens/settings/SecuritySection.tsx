import React from "react";
import { KeyboardAvoidingView } from "react-native";
import { useSession } from "../../state/sessionStore";
import { ApprovalsCard } from "./ApprovalsCard";
import { DevicesCard } from "./DevicesCard";
import { NetworkSafetyCard } from "./NetworkSafetyCard";
import { RuntimeGroups } from "./RuntimeConfigSection";

export function SecuritySection() {
  const { session } = useSession();
  return (
    <KeyboardAvoidingView behavior="padding">
      <ApprovalsCard />
      {session ? <DevicesCard session={session} /> : null}
      <RuntimeGroups page="security" lead={<NetworkSafetyCard />} />
    </KeyboardAvoidingView>
  );
}

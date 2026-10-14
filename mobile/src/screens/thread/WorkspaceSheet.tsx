import React, { useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useT } from "../../i18n";
import type { ProjectDirectory, WorkspaceDirectoriesPayload, WorkspaceScopePayload } from "@/lib/types";
import { workspaceStore, useWorkspace, withAccessMode } from "../../state/workspace";
import { Button, IconButton, ListItem, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

/** Header button + sheet; renders nothing for temporary chats or when the server forbids changing project. */
export function WorkspaceButton({ chatKey }: { chatKey: string }) {
  const t = useT();
  const { scope, info } = useWorkspace(chatKey);
  const [open, setOpen] = useState(false);
  if (!scope || info?.controls?.can_change_project === false) return null;
  return (
    <>
      <IconButton icon="folder-outline" accessibilityLabel={t("workspace.open")} onPress={() => setOpen(true)} />
      <WorkspaceSheet chatKey={chatKey} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function WorkspaceSheet({ chatKey, open, onClose }: { chatKey: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const th = useTheme();
  const { scope, info, browse, setScope } = useWorkspace(chatKey);
  const [pending, setPending] = useState<"restricted" | "full" | null>(null);
  const [dir, setDir] = useState<WorkspaceDirectoriesPayload | null>(null);
  if (!scope) return null;

  const apply = async (next: WorkspaceScopePayload) => {
    try {
      await setScope(next);
      if (workspaceStore.getState().errors[chatKey]) toast.show(t("workspace.error"));
    } catch {
      toast.show(t("workspace.error"));
    }
  };
  const mode = pending ?? scope.access_mode;
  const toggle = async (full: boolean) => {
    const m = full ? "full" : "restricted";
    setPending(m); // optimistic; clearing it reverts to the server's scope
    try { await apply(withAccessMode(scope, m)); } finally { setPending(null); }
  };
  const go = (path: string) => browse(path).then(setDir, () => toast.show(t("workspace.error")));
  const pick = (p: ProjectDirectory) => { void apply({ ...scope, project_path: p.path, project_name: p.name }); };
  const muted = { color: th.colors.mutedForeground, fontSize: 13, marginTop: 12 };
  const list = (title: string, items?: ProjectDirectory[]) =>
    items?.length ? (
      <>
        <Text style={muted}>{title}</Text>
        {items.map((p) => <ListItem key={p.path} title={p.name} subtitle={p.path} onPress={() => pick(p)} />)}
      </>
    ) : null;

  return (
    <Sheet open={open} onClose={() => { setDir(null); onClose(); }} title={t("workspace.title")}>
      <ScrollView style={{ maxHeight: 480 }}>
        {dir ? (
          <>
            <Text style={{ color: th.colors.popoverForeground, marginBottom: 8 }}>{dir.path}</Text>
            {dir.parent ? <ListItem title=".." onPress={() => void go(dir.parent!)} /> : null}
            {dir.entries.map((e) => <ListItem key={e.path} title={e.name} onPress={() => void go(e.path)} />)}
            <Button title={t("workspace.useFolder")} onPress={() => { void apply({ ...scope, project_path: dir.path, project_name: undefined }); setDir(null); }} />
          </>
        ) : (
          <>
            <Text style={{ color: th.colors.popoverForeground, fontFamily: th.font.medium, fontSize: 16 }}>{scope.project_name ?? scope.project_path}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 }}>
              <Text style={{ color: th.colors.popoverForeground }}>{t("workspace.fullAccess")}</Text>
              <Switch accessibilityLabel={t("workspace.fullAccess")} value={mode === "full"} disabled={pending != null} onValueChange={toggle} />
            </View>
            {list(t("workspace.recent"), info?.recent_projects)}
            {list(t("workspace.favorites"), info?.favorite_projects)}
            <Button title={t("workspace.browse")} variant="ghost" onPress={() => void go(scope.project_path)} />
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

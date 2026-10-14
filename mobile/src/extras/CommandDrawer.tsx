import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useT } from "../i18n";
import { useSession } from "../state/sessionStore";
import { useThreadSlice } from "../state/threadStore";
import { Button } from "../ui/components/Button";
import { Dialog } from "../ui/components/Dialog";
import { IconButton } from "../ui/components/IconButton";
import { Sheet } from "../ui/components/Sheet";
import { TextField } from "../ui/components/TextField";
import { useTheme } from "../ui/ThemeProvider";
import { groupCommands, loadCommands, type Cmd } from "./logic";

export function CommandDrawerButton({ chatKey }: { chatKey: string }) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const { send } = useThreadSlice(chatKey);

  const [open, setOpen] = useState(false);
  const [commands, setCommands] = useState<Cmd[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedWithArgs, setSelectedWithArgs] = useState<Cmd | null>(null);
  const [argValue, setArgValue] = useState("");
  const argValueRef = useRef("");

  const updateArgValue = (val: string) => {
    argValueRef.current = val;
    setArgValue(val);
  };

  const fetchCommands = () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    loadCommands(session)
      .then((cmds) => {
        setCommands(cmds ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  };

  useEffect(() => {
    if (open) {
      fetchCommands();
    }
  }, [open, session]);

  const handleSelectCommand = (cmd: Cmd) => {
    if (cmd.acceptsArgs) {
      argValueRef.current = "";
      setArgValue("");
      setSelectedWithArgs(cmd);
    } else {
      send(cmd.command);
      setOpen(false);
    }
  };

  const handleConfirmArgs = () => {
    if (!selectedWithArgs) return;
    const trimmed = argValueRef.current.trim();
    const message = trimmed ? `${selectedWithArgs.command} ${trimmed}` : selectedWithArgs.command;
    send(message);
    setSelectedWithArgs(null);
    setOpen(false);
  };

  const groups = groupCommands(commands);

  return (
    <>
      <IconButton
        icon="console-line"
        accessibilityLabel={t("extras.commands")}
        onPress={() => setOpen(true)}
      />

      {open ? (
        <Sheet open={open} onClose={() => setOpen(false)} title={t("extras.commands")}>
        <View style={styles.sheetContent}>
          {loading ? (
            <Text style={[styles.statusText, { color: th.colors.mutedForeground }]}>
              {t("common.loading")}
            </Text>
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={[styles.statusText, { color: th.colors.destructive }]}>
                {t("extras.commandsError")}
              </Text>
              <Button title={t("common.retry")} onPress={fetchCommands} />
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {groups.map(({ group, items }) => (
                <View key={group} style={styles.groupSection}>
                  <Text
                    style={[
                      styles.groupHeader,
                      { color: th.colors.mutedForeground, fontFamily: th.font.medium },
                    ]}
                  >
                    {t(`extras.group.${group}`, { defaultValue: group })}
                  </Text>
                  {items.map((cmd) => (
                    <Pressable
                      key={cmd.command}
                      onPress={() => handleSelectCommand(cmd)}
                      accessibilityRole="button"
                      accessibilityLabel={`${cmd.command} ${cmd.title}`}
                      style={({ pressed }) => [
                        styles.cmdRow,
                        { backgroundColor: pressed ? th.colors.accent : "transparent" },
                      ]}
                    >
                      <View style={styles.cmdHeader}>
                        <Text
                          style={[
                            styles.cmdName,
                            { color: th.colors.primary, fontFamily: th.font.medium },
                          ]}
                        >
                          {cmd.command}
                        </Text>
                        <Text
                          style={[
                            styles.cmdTitle,
                            { color: th.colors.foreground, fontFamily: th.font.regular },
                          ]}
                        >
                          {cmd.title}
                        </Text>
                      </View>
                      {cmd.description ? (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.cmdDesc,
                            { color: th.colors.mutedForeground, fontFamily: th.font.regular },
                          ]}
                        >
                          {cmd.description}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Sheet>
      ) : null}

      {selectedWithArgs ? (
        <Dialog
          open={!!selectedWithArgs}
          title={selectedWithArgs?.title || selectedWithArgs?.command || ""}
          confirmLabel={t("common.ok")}
          cancelLabel={t("common.cancel")}
          onConfirm={handleConfirmArgs}
          onCancel={() => setSelectedWithArgs(null)}
        >
          <TextField
            label={selectedWithArgs?.command ?? ""}
            placeholder={selectedWithArgs?.argHint}
            value={argValue}
            onChangeText={updateArgValue}
            autoCapitalize="none"
          />
        </Dialog>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    maxHeight: 360,
    paddingVertical: 8,
  },
  scroll: {
    maxHeight: 340,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  statusText: {
    textAlign: "center",
    padding: 16,
    fontSize: 14,
  },
  errorBox: {
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  groupSection: {
    marginBottom: 12,
  },
  groupHeader: {
    fontSize: 12,
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 4,
    letterSpacing: 0.5,
  },
  cmdRow: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: "center",
  },
  cmdHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cmdName: {
    fontSize: 15,
  },
  cmdTitle: {
    fontSize: 14,
  },
  cmdDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});

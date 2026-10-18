import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { UIMessage } from "@/lib/types";
import { useT } from "../../i18n";
import { useSession } from "../../state/sessionStore";
import { Button, IconButton, Sheet, toast } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";
import { FileEditList } from "./FileEditList";
import {
  formatRowDescription,
  toolCallsOf,
  toolIcon,
  type ToolCall,
} from "./toolCalls";

export { toolCallsOf, type ToolCall, type ToolCallStatus } from "./toolCalls";

export type ToolActivitySheetProps = {
  open: boolean;
  onClose: () => void;
  messages: UIMessage[];
  chatKey?: string;
};

const TRUNCATE_LIMIT = 4000;

function tryPrettyJson(val: unknown): string {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") {
    const trimmed = val.trim();
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return val;
    }
  }
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export function ToolActivitySheet({
  open,
  onClose,
  messages,
  chatKey,
}: ToolActivitySheetProps) {
  const th = useTheme();
  const t = useT();
  const { session } = useSession();

  const calls = useMemo(() => toolCallsOf(messages), [messages]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // When sheet closes, reset selection
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
    }
  }, [open]);

  // Keep selectedCall in sync with live updates
  const selectedCall = useMemo(
    () => (selectedId ? calls.find((c) => c.id === selectedId) ?? null : null),
    [calls, selectedId]
  );

  return (
    <Sheet open={open} onClose={onClose} scroll={false}>
      {selectedCall ? (
        <ToolDetailView
          call={selectedCall}
          onBack={() => setSelectedId(null)}
          onClose={onClose}
          chatKey={chatKey}
        />
      ) : (
        <ToolListView
          calls={calls}
          onSelect={(call) => setSelectedId(call.id)}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function ToolListView({
  calls,
  onSelect,
  onClose,
}: {
  calls: ToolCall[];
  onSelect: (call: ToolCall) => void;
  onClose: () => void;
}) {
  const th = useTheme();
  const t = useT();

  const title = t("thread.toolSheetTitle", { count: calls.length });

  return (
    <View style={{ flexShrink: 1, maxHeight: "100%" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            color: th.colors.popoverForeground,
            fontFamily: th.font.display,
            fontSize: 20,
            flex: 1,
          }}
        >
          {title}
        </Text>
        <IconButton
          icon="close"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
        />
      </View>

      {/* List */}
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        renderItem={({ item, index }) => (
          <ToolListItem
            call={item}
            isFirst={index === 0}
            isLast={index === calls.length - 1}
            onPress={() => onSelect(item)}
          />
        )}
      />
    </View>
  );
}

function ToolListItem({
  call,
  isFirst,
  isLast,
  onPress,
}: {
  call: ToolCall;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const th = useTheme();
  const t = useT();

  const iconName = toolIcon(call.name);
  const description = formatRowDescription(call.hint);

  return (
    <Pressable
      testID={`tool-call-row-${call.id}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 48,
        paddingVertical: 6,
      }}
    >
      {/* Timeline column */}
      <View
        style={{
          width: 36,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "stretch",
        }}
      >
        {/* Top half line */}
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: "50%",
            width: 2,
            backgroundColor: isFirst ? "transparent" : th.colors.border,
          }}
        />
        {/* Bottom half line */}
        <View
          style={{
            position: "absolute",
            top: "50%",
            bottom: 0,
            width: 2,
            backgroundColor: isLast ? "transparent" : th.colors.border,
          }}
        />
        {/* Icon circle */}
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: th.colors.muted,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: th.colors.border,
          }}
        >
          <MaterialCommunityIcons
            name={iconName}
            size={16}
            color={th.colors.foreground}
          />
        </View>
      </View>

      {/* Row content */}
      <View style={{ flex: 1, marginLeft: 10, justifyContent: "center" }}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: th.colors.foreground,
            fontFamily: th.font.medium,
            fontSize: 14,
          }}
        >
          {description}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, gap: 6 }}>
          {call.status === "error" ? (
            <Text
              style={{
                color: th.colors.destructive,
                fontFamily: th.font.regular,
                fontSize: 12,
              }}
            >
              {t("thread.toolStatusError")}
            </Text>
          ) : call.status === "running" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ActivityIndicator size="small" color={th.colors.primary} />
              <Text
                style={{
                  color: th.colors.mutedForeground,
                  fontFamily: th.font.regular,
                  fontSize: 12,
                }}
              >
                {t("thread.toolStatusRunning")}
              </Text>
            </View>
          ) : (
            <Text
              style={{
                color: th.colors.mutedForeground,
                fontFamily: th.font.regular,
                fontSize: 12,
              }}
            >
              {t("thread.toolStatusDone")}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function ToolDetailView({
  call,
  onBack,
  onClose,
  chatKey,
}: {
  call: ToolCall;
  onBack: () => void;
  onClose: () => void;
  chatKey?: string;
}) {
  const th = useTheme();
  const t = useT();
  const { session } = useSession();

  const [showAll, setShowAll] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [fetchedResult, setFetchedResult] = useState<string | null>(null);

  // Check if we need to fetch oversized traceDetail
  const hasResultOrError = call.result !== undefined || call.error !== undefined;
  const needsFetch = !hasResultOrError && !!call.detailRef && fetchedResult === null && !detailLoading && detailError === null;

  useEffect(() => {
    if (!needsFetch || !call.detailRef) return;
    const ref = call.detailRef;
    const targetKey = chatKey ?? (session?.client as { currentChatKey?: string })?.currentChatKey ?? "";

    setDetailLoading(true);
    setDetailError(null);

    const doFetch = async () => {
      if (!session?.get) throw new Error(t("thread.toolDetailError"));
      const url = `/api/sessions/${encodeURIComponent(targetKey)}/webui-thread/trace-detail?ref=${encodeURIComponent(ref)}`;
      return session.get<{
        events?: Array<{
          tool_events?: Array<{ call_id?: string; result?: unknown; error?: unknown }>;
          call_id?: string;
          text?: string;
        }>;
      }>(url);
    };

    doFetch()
      .then((payload) => {
        let extracted: string | null = null;
        if (payload?.events) {
          for (const ev of payload.events) {
            const toolEvents = ev.tool_events;
            if (toolEvents) {
              const found = toolEvents.find(
                (te: { call_id?: string; result?: unknown; error?: unknown }) => te.call_id === call.id
              );
              if (found) {
                if (found.result !== undefined) {
                  extracted = typeof found.result === "string" ? found.result : JSON.stringify(found.result, null, 2);
                } else if (found.error !== undefined) {
                  extracted = typeof found.error === "string" ? found.error : JSON.stringify(found.error, null, 2);
                }
                break;
              }
            }
            if (ev.call_id === call.id && ev.text) {
              extracted = ev.text;
              break;
            }
          }
          if (extracted === null && payload.events.length > 0) {
            const first = payload.events[0];
            extracted =
              first.text ??
              (first.tool_events?.[0]?.result !== undefined
                ? JSON.stringify(first.tool_events[0].result, null, 2)
                : null);
          }
        }
        setFetchedResult(extracted ?? "");
      })
      .catch((err) => {
        setDetailError(err instanceof Error ? err.message : t("thread.toolDetailError"));
      })
      .finally(() => {
        setDetailLoading(false);
      });
  }, [needsFetch, call.detailRef, call.id, chatKey, session, t]);

  // Command / Arguments text
  const isExec =
    call.name === "exec" ||
    call.name === "exec_shell" ||
    call.name === "bash" ||
    call.name === "sh";

  let cmdOrArgsText = "";
  if (isExec && call.args && typeof call.args === "object" && typeof (call.args as Record<string, unknown>).command === "string") {
    cmdOrArgsText = (call.args as Record<string, unknown>).command as string;
  } else {
    cmdOrArgsText = tryPrettyJson(call.args);
  }

  // Result text
  let rawResultText = "";
  if (call.result !== undefined) {
    rawResultText = tryPrettyJson(call.result);
  } else if (call.error !== undefined) {
    rawResultText = tryPrettyJson(call.error);
  } else if (fetchedResult !== null) {
    rawResultText = fetchedResult;
  }

  const isLongResult = rawResultText.length > TRUNCATE_LIMIT;
  const displayedResult = isLongResult && !showAll ? rawResultText.slice(0, TRUNCATE_LIMIT) : rawResultText;

  const copyText = (txt: string) => {
    void Clipboard.setStringAsync(txt);
    toast.show(t("thread.copied"));
  };

  return (
    <View style={{ flexShrink: 1, maxHeight: "100%" }}>
      {/* Header with back button and close button */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          <IconButton
            icon="arrow-left"
            accessibilityLabel={t("common.back")}
            onPress={onBack}
          />
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              color: th.colors.popoverForeground,
              fontFamily: th.font.display,
              fontSize: 20,
              flex: 1,
            }}
          >
            {call.name}
          </Text>
        </View>
        <IconButton
          icon="close"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24, gap: 16 }}
      >
        {/* Status */}
        <View>
          <Text
            style={{
              color: th.colors.mutedForeground,
              fontFamily: th.font.medium,
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            Stato
          </Text>
          {call.status === "error" ? (
            <Text
              style={{
                color: th.colors.destructive,
                fontFamily: th.font.medium,
                fontSize: 14,
              }}
            >
              {t("thread.toolStatusError")}
            </Text>
          ) : call.status === "running" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ActivityIndicator size="small" color={th.colors.primary} />
              <Text
                style={{
                  color: th.colors.mutedForeground,
                  fontFamily: th.font.medium,
                  fontSize: 14,
                }}
              >
                {t("thread.toolStatusInProgress")}
              </Text>
            </View>
          ) : (
            <Text
              style={{
                color: th.colors.foreground,
                fontFamily: th.font.medium,
                fontSize: 14,
              }}
            >
              {t("thread.toolStatusCompleted")}
            </Text>
          )}
        </View>

        {/* Descrizione */}
        {call.hint ? (
          <View>
            <Text
              style={{
                color: th.colors.mutedForeground,
                fontFamily: th.font.medium,
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              {t("thread.toolDescription")}
            </Text>
            <Text
              selectable
              style={{
                color: th.colors.foreground,
                fontFamily: th.font.regular,
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {call.hint}
            </Text>
          </View>
        ) : null}

        {/* Comando / Argomenti */}
        {cmdOrArgsText ? (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Text
                style={{
                  color: th.colors.mutedForeground,
                  fontFamily: th.font.medium,
                  fontSize: 12,
                }}
              >
                {isExec ? t("thread.toolCommand") : t("thread.toolArguments")}
              </Text>
              <IconButton
                icon="content-copy"
                size={18}
                accessibilityLabel={t("thread.copyCode")}
                onPress={() => copyText(cmdOrArgsText)}
              />
            </View>

            <View
              style={{
                backgroundColor: th.colors.muted,
                borderRadius: th.radius.sm,
                borderWidth: 1,
                borderColor: th.colors.border,
                overflow: "hidden",
              }}
            >
              <ScrollView horizontal style={{ padding: 10 }}>
                <Text
                  selectable
                  style={{
                    fontFamily: th.font.mono,
                    fontSize: 12,
                    color: th.colors.foreground,
                  }}
                >
                  {cmdOrArgsText}
                </Text>
              </ScrollView>
            </View>
          </View>
        ) : null}

        {/* Risultato */}
        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                color: th.colors.mutedForeground,
                fontFamily: th.font.medium,
                fontSize: 12,
              }}
            >
              {t("thread.toolResult")}
            </Text>
            {rawResultText ? (
              <IconButton
                icon="content-copy"
                size={18}
                accessibilityLabel={t("thread.copyCode")}
                onPress={() => copyText(rawResultText)}
              />
            ) : null}
          </View>

          {detailLoading ? (
            <View style={{ paddingVertical: 12, alignItems: "center" }}>
              <ActivityIndicator size="small" color={th.colors.primary} />
            </View>
          ) : detailError ? (
            <View style={{ gap: 8, alignItems: "flex-start" }}>
              <Text
                style={{
                  color: th.colors.destructive,
                  fontFamily: th.font.regular,
                  fontSize: 13,
                }}
              >
                {detailError}
              </Text>
              <Button
                title={t("common.retry")}
                variant="secondary"
                onPress={() => setDetailError(null)}
              />
            </View>
          ) : rawResultText ? (
            <View
              style={{
                backgroundColor: th.colors.muted,
                borderRadius: th.radius.sm,
                borderWidth: 1,
                borderColor: th.colors.border,
                overflow: "hidden",
              }}
            >
              <ScrollView horizontal style={{ padding: 10 }}>
                <Text
                  selectable
                  style={{
                    fontFamily: th.font.mono,
                    fontSize: 12,
                    color: call.status === "error" ? th.colors.destructive : th.colors.foreground,
                  }}
                >
                  {displayedResult}
                </Text>
              </ScrollView>
              {isLongResult && !showAll ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowAll(true)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderTopColor: th.colors.border,
                    alignItems: "center",
                    backgroundColor: th.colors.background,
                  }}
                >
                  <Text
                    style={{
                      color: th.colors.primary,
                      fontFamily: th.font.medium,
                      fontSize: 13,
                    }}
                  >
                    {t("thread.toolShowAll")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text
              style={{
                color: th.colors.mutedForeground,
                fontFamily: th.font.regular,
                fontSize: 13,
              }}
            >
              —
            </Text>
          )}
        </View>

        {/* File modificati */}
        {call.fileEdits && call.fileEdits.length > 0 ? (
          <View>
            <Text
              style={{
                color: th.colors.mutedForeground,
                fontFamily: th.font.medium,
                fontSize: 12,
                marginBottom: 6,
              }}
            >
              {t("thread.toolModifiedFiles")}
            </Text>
            <FileEditList edits={call.fileEdits} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

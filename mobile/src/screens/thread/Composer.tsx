import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EffortPill } from "../../extras/EffortPill";
import { loadCommands, type Cmd } from "../../extras/logic";
import { useT } from "../../i18n";
import { useSession } from "../../state/sessionStore";
import { useThreadSlice } from "../../state/threadStore";
import { useChats } from "../../state/chatsStore";
import { IconButton } from "../../ui/components/IconButton";
import { ListItem } from "../../ui/components/ListItem";
import { Sheet } from "../../ui/components/Sheet";
import { toast } from "../../ui/components/Toast";
import { useTheme } from "../../ui/ThemeProvider";
import { ContextIndicator } from "./ContextIndicator";
import { SlashMenu } from "./SlashMenu";
import { VoiceButton } from "./VoiceButton";
import { voiceAvailable } from "../../extras/voice";
import { DEFAULT_LIMITS } from "../../core/session";
import { prepareImage, validateFiles, type LocalFile } from "../../core/upload";
import { AttachmentBar } from "./AttachmentBar";
import { toLocalFile, type RawPickerAsset } from "./attachments";
import { MentionMenu } from "./MentionMenu";
import {
  getActiveMention,
  pruneMentions,
  replaceMentionToken,
  toCliAppMention,
  toMcpPresetMention,
  toSessionMention,
  type MentionCandidate,
} from "./mentions";
import type {
  CliAppInfo,
  CliAppsPayload,
  McpPresetInfo,
  McpPresetsPayload,
  OutboundCliAppMention,
  OutboundMcpPresetMention,
  SessionMention,
  SettingsPayload,
} from "@/lib/types";

export function Composer({ chatKey }: { chatKey: string }) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const chats = useChats((s) => s.chats);
  const {
    draft,
    setDraft,
    send,
    running,
    stop,
    pendingFiles = [],
    setPendingFiles = () => {},
    sendError = null,
    uploading = false,
    clearSendError = () => {},
  } = useThreadSlice(chatKey);

  const prevUploading = useRef(uploading);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [commands, setCommands] = useState<Cmd[]>([]);
  const [cliApps, setCliApps] = useState<CliAppInfo[]>([]);
  const [mcpPresets, setMcpPresets] = useState<McpPresetInfo[]>([]);
  const [pickedSessions, setPickedSessions] = useState<SessionMention[]>([]);
  const [pickedApps, setPickedApps] = useState<OutboundCliAppMention[]>([]);
  const [pickedPresets, setPickedPresets] = useState<OutboundMcpPresetMention[]>([]);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);

  const limits = session?.limits ?? DEFAULT_LIMITS;

  useEffect(() => {
    let active = true;
    if (!session) {
      setCommands([]);
      setCliApps([]);
      setMcpPresets([]);
      return;
    }
    loadCommands(session)
      .then((cmds) => {
        if (active) {
          const norm = (cmds ?? []).map((c) => ({
            ...c,
            command: c.command.startsWith("/") ? c.command : `/${c.command}`,
          }));
          setCommands(norm);
        }
      })
      .catch(() => {
        if (active) setCommands([]);
      });

    if (typeof session.get === "function") {
      session
        .get<CliAppsPayload>("/api/settings/cli-apps?installed_only=1")
        .then((res) => {
          if (active && res?.apps) setCliApps(res.apps);
        })
        .catch(() => {});

      session
        .get<McpPresetsPayload>("/api/settings/mcp-presets")
        .then((res) => {
          if (active && res?.presets) setMcpPresets(res.presets);
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [session]);

  const [voiceOk, setVoiceOk] = useState(false);
  useEffect(() => {
    let active = true;
    if (!session?.get) return;
    session.get<SettingsPayload>("/api/settings").then(
      (st) => active && setVoiceOk(voiceAvailable(st)),
      () => active && setVoiceOk(false),
    );
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (sendError) {
      let msg: string;
      if (sendError === "count") msg = t("attach.error.count");
      else if (sendError === "file_size") msg = t("attach.error.file_size");
      else if (sendError === "total_size") msg = t("attach.error.total_size");
      else if (sendError === "type") msg = t("attach.error.type");
      else if (sendError === "upload_unavailable") msg = t("attach.error.upload_unavailable");
      else if (sendError === "upload_failed_413") msg = t("attach.error.upload_failed_413");
      else if (sendError.startsWith("upload_failed_")) {
        const status = sendError.slice("upload_failed_".length);
        msg = t("attach.error.upload_failed", { status });
      } else {
        msg = t(`attach.error.${sendError}`, { defaultValue: t("attach.error.generic") });
      }
      toast.show(msg);
      clearSendError();
    }
  }, [sendError, t, clearSendError]);

  useEffect(() => {
    if (prevUploading.current && !uploading && !sendError) {
      setPickedSessions([]);
      setPickedApps([]);
      setPickedPresets([]);
    }
    prevUploading.current = uploading;
  }, [uploading, sendError]);

  const handleDraftChange = (newDraft: string) => {
    setDraft(newDraft);
    setCursor(newDraft.length);
    setPickedSessions((prev) => pruneMentions(newDraft, prev));
    setPickedApps((prev) => pruneMentions(newDraft, prev));
    setPickedPresets((prev) => pruneMentions(newDraft, prev));
  };

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const appendTranscript = (text: string) => {
    const d = draftRef.current;
    handleDraftChange(d ? `${d} ${text}` : text);
  };

  const trimmed = draft.trim();
  const isSlash = draft.startsWith("/") && !/[\s\n]/.test(draft);
  const activeMention = getActiveMention(draft, cursor);
  const isMention = !!activeMention;

  const handleSelectCommand = (c: Cmd) => {
    handleDraftChange(`${c.command} `);
    inputRef.current?.focus();
  };

  const handleSelectMention = (candidate: MentionCandidate) => {
    const mention = activeMention ?? getActiveMention(draft, cursor);
    if (!mention) return;

    if (candidate.kind === "chat") {
      const sessionMention = toSessionMention(candidate.chat);
      const exists = pickedSessions.some((s) => s.session_key === sessionMention.session_key);
      if (!exists) {
        if (pickedSessions.length >= 8) {
          toast.show(t("mentions.limit"));
          return;
        }
        setPickedSessions((prev) => [...prev, sessionMention]);
      }
    } else if (candidate.kind === "app") {
      const appMention = toCliAppMention(candidate.app);
      setPickedApps((prev) => {
        if (prev.some((a) => a.name === appMention.name)) return prev;
        return [...prev, appMention];
      });
    } else if (candidate.kind === "mcp") {
      const presetMention = toMcpPresetMention(candidate.preset);
      setPickedPresets((prev) => {
        if (prev.some((p) => p.name === presetMention.name)) return prev;
        return [...prev, presetMention];
      });
    }

    const newDraft = replaceMentionToken(draft, candidate.name, mention);
    handleDraftChange(newDraft);
    inputRef.current?.focus();
  };

  const handleAddAssets = async (assets: RawPickerAsset[]) => {
    if (!assets || assets.length === 0) return;
    const incoming = assets.map(toLocalFile);
    const preparedList: LocalFile[] = [];
    for (const file of incoming) {
      if (file.mime.startsWith("image/")) {
        const prep = await prepareImage(file, limits.max_file_bytes);
        preparedList.push(prep);
      } else {
        preparedList.push(file);
      }
    }
    const validation = validateFiles([...pendingFiles, ...preparedList], limits);
    if (!validation.ok) {
      const reasonKey = `attach.error.${validation.reason}`;
      const reasonText = t(reasonKey);
      const message = validation.name ? `${reasonText}: ${validation.name}` : reasonText;
      toast.show(message);
      return;
    }
    setPendingFiles([...pendingFiles, ...preparedList]);
  };

  const handlePickPhotos = async () => {
    setSheetOpen(false);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
      });
      if (!res.canceled && res.assets) {
        await handleAddAssets(res.assets);
      }
    } catch {
      toast.show(t("attach.error.generic"));
    }
  };

  const handlePickFiles = async () => {
    setSheetOpen(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets) {
        await handleAddAssets(res.assets);
      }
    } catch {
      toast.show(t("attach.error.generic"));
    }
  };

  const hasContent = trimmed.length > 0 || pendingFiles.length > 0;
  const canSend = hasContent && !uploading;

  const handleSend = () => {
    if (!canSend) return;
    const opts: Parameters<typeof send>[1] = {};
    if (pendingFiles.length > 0) opts.files = pendingFiles;

    const validSessions = pruneMentions(trimmed, pickedSessions);
    const validApps = pruneMentions(trimmed, pickedApps);
    const validPresets = pruneMentions(trimmed, pickedPresets);

    if (validSessions.length > 0) opts.sessionMentions = validSessions;
    if (validApps.length > 0) opts.cliApps = validApps;
    if (validPresets.length > 0) opts.mcpPresets = validPresets;

    const hasOpts = Object.keys(opts).length > 0;
    const ok = hasOpts ? send(trimmed, opts) : send(trimmed);
    if (ok) {
      if (!opts.files || opts.files.length === 0) {
        setPickedSessions([]);
        setPickedApps([]);
        setPickedPresets([]);
      }
    }
  };

  const isRunningEmpty = running && !hasContent;

  return (
    <View style={[styles.container, { borderTopColor: th.colors.border }]}>
      {isSlash ? (
        <SlashMenu query={draft} commands={commands} onSelect={handleSelectCommand} />
      ) : isMention && activeMention ? (
        <MentionMenu
          chats={chats}
          apps={cliApps}
          presets={mcpPresets}
          query={activeMention.query}
          onSelect={handleSelectMention}
        />
      ) : null}

      {pendingFiles.length > 0 ? (
        <AttachmentBar
          files={pendingFiles}
          onRemove={(_file, index) => {
            setPendingFiles(pendingFiles.filter((_, i) => i !== index));
          }}
        />
      ) : null}

      <View style={styles.inputRow}>
        <View style={styles.leftSlot}>
          <IconButton
            icon="paperclip"
            accessibilityLabel={t("attach.button")}
            disabled={uploading}
            onPress={() => setSheetOpen(true)}
          />
          <EffortPill chatKey={chatKey} />
          <ContextIndicator chatKey={chatKey} />
        </View>

        <TextInput
          ref={inputRef}
          multiline
          textAlignVertical="top"
          value={draft}
          onChangeText={handleDraftChange}
          onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
          placeholder={t("composer.placeholder")}
          placeholderTextColor={th.colors.mutedForeground}
          style={[
            styles.input,
            {
              color: th.colors.foreground,
              fontFamily: th.font.regular,
              backgroundColor: th.colors.background,
              borderColor: th.colors.border,
              borderRadius: th.radius.md,
            },
          ]}
        />

        <View style={[styles.rightSlot, { flexDirection: "row" }]}>
          {voiceOk ? <VoiceButton onTranscript={appendTranscript} /> : null}
          {voiceOk && !hasContent && !running ? null : isRunningEmpty ? (
            <IconButton
              icon="stop-circle-outline"
              accessibilityLabel={t("thread.stop")}
              onPress={stop}
            />
          ) : running ? (
            <IconButton
              icon="send"
              accessibilityLabel={t("composer.steer")}
              disabled={!canSend}
              loading={uploading}
              onPress={handleSend}
            />
          ) : (
            <IconButton
              icon="send"
              accessibilityLabel={t("composer.send")}
              disabled={!canSend}
              loading={uploading}
              onPress={handleSend}
            />
          )}
        </View>
      </View>

      {sheetOpen ? (
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("attach.title")}>
          <ListItem
            left={<MaterialCommunityIcons name="image-multiple-outline" size={24} color={th.colors.foreground} />}
            title={t("attach.photos")}
            onPress={handlePickPhotos}
          />
          <ListItem
            left={<MaterialCommunityIcons name="file-document-outline" size={24} color={th.colors.foreground} />}
            title={t("attach.files")}
            onPress={handlePickFiles}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  leftSlot: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  rightSlot: {
    justifyContent: "flex-end",
  },
});

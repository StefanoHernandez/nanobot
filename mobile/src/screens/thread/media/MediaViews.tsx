import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer as ExpoPlayer } from "expo-audio";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import type { UIMediaAttachment } from "@/lib/types";
import { useSession } from "../../../state/sessionStore";
import { IconButton, toast } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { absoluteMediaUrl, classify, downloadMedia, extOf, mediaName, openLocal, shareMedia } from "./media";
import { viewerKind } from "../../viewer/formats";

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const ICONS: Record<string, Icon> = {
  pdf: "file-pdf-box", ppt: "file-powerpoint", pptx: "file-powerpoint", doc: "file-word", docx: "file-word",
  xls: "file-excel", xlsx: "file-excel", csv: "file-excel", zip: "folder-zip",
  txt: "file-document-outline", md: "file-document-outline", json: "file-code", html: "file-code", py: "file-code", js: "file-code", ts: "file-code",
};

export function MediaList({ media }: { media: UIMediaAttachment[] }) {
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      {media.map((m, i) => <MediaItem key={i} m={m} />)}
    </View>
  );
}

function MediaItem({ m }: { m: UIMediaAttachment }) {
  const { profile } = useSession();
  const { t } = useTranslation();
  const th = useTheme();
  const name = mediaName(m);
  if (!m.url)
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: th.radius.md, backgroundColor: th.colors.muted }}>
        <MaterialCommunityIcons name="file-hidden" size={22} color={th.colors.mutedForeground} />
        <Text style={{ color: th.colors.mutedForeground, fontSize: 13, flexShrink: 1 }}>{name ? `${name} · ` : ""}{t("media.unavailable")}</Text>
      </View>
    );
  const url = absoluteMediaUrl(profile?.baseUrl ?? "", m.url);
  const c = classify(m);
  if (c === "image") return <MediaImage url={url} name={name} />;
  if (c === "audio") return <AudioPlayer url={url} name={name} />;
  return <FileCard url={url} name={name} ext={extOf(m)} />;
}

export function MediaImage({ url, name }: { url: string; name: string }) {
  const { t } = useTranslation();
  const th = useTheme();
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState(4 / 3);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel={name || t("media.image")}>
        <Image testID="media-image" onLoad={(e) => { const { width: w, height: h } = e.nativeEvent.source; if (w && h) setRatio(w / h); }} source={{ uri: url }} style={{ width: "100%", maxWidth: 320, aspectRatio: ratio, borderRadius: th.radius.md, backgroundColor: th.colors.muted }} resizeMode="cover" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} accessibilityLabel={t("media.close")} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }}>
          <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

let current: ExpoPlayer | null = null; // one player at a time

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type PlayerUIProps = { name: string; playing: boolean; currentTime: number; duration: number; onToggle: () => void };

function PlayerUI({ name, playing, currentTime, duration, onToggle }: PlayerUIProps) {
  const { t } = useTranslation();
  const th = useTheme();
  const pct = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", padding: 4, paddingRight: 12, borderRadius: th.radius.md, backgroundColor: th.colors.muted, maxWidth: 340 }}>
      <IconButton icon={playing ? "pause" : "play"} size={28} onPress={onToggle} accessibilityLabel={playing ? t("media.pause") : t("media.play")} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={1} style={{ color: th.colors.foreground, fontSize: 13 }}>{name}</Text>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: th.colors.border }}>
          <View style={{ width: `${pct * 100}%`, height: 4, borderRadius: 2, backgroundColor: th.colors.primary }} />
        </View>
        <Text style={{ color: th.colors.mutedForeground, fontSize: 11 }}>{fmt(currentTime)} / {fmt(duration || 0)}</Text>
      </View>
    </View>
  );
}

/** No native player until the first tap; then the real one mounts and starts playing. */
export function AudioPlayer({ url, name }: { url: string; name: string }) {
  const [started, setStarted] = useState(false);
  if (!started) return <PlayerUI name={name} playing={false} currentTime={0} duration={0} onToggle={() => setStarted(true)} />;
  return <ActivePlayer url={url} name={name} />;
}

function ActivePlayer({ url, name }: { url: string; name: string }) {
  const player = useAudioPlayer({ uri: url });
  const st = useAudioPlayerStatus(player);
  const claim = () => {
    if (current && current !== player) current.pause();
    current = player;
  };
  useEffect(() => {
    claim();
    player.play();
    return () => {
      if (current === player) current = null;
      try { player.pause(); } catch { /* already released */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);
  useEffect(() => {
    if (st.didJustFinish && current === player) current = null;
  }, [st.didJustFinish, player]);
  const toggle = () => {
    if (st.playing) return player.pause();
    claim();
    if (st.duration > 0 && st.currentTime >= st.duration) player.seekTo(0);
    player.play();
  };
  return <PlayerUI name={name} playing={st.playing} currentTime={st.currentTime} duration={st.duration} onToggle={toggle} />;
}

export function FileCard({ url, name, ext }: { url: string; name: string; ext: string }) {
  const { t } = useTranslation();
  const th = useTheme();
  const [busy, setBusy] = useState(false);
  const run = async (share: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const local = await downloadMedia(url, name);
      if (share) {
        await shareMedia(local);
      } else if (viewerKind(name) !== null) {
        router.push({ pathname: "/viewer", params: { uri: local, name } });
      } else {
        await openLocal(local, ext);
      }
    } catch {
      toast.show(t(share ? "media.shareFailed" : "media.openFailed")); // never include the url
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable
      onPress={() => run(false)}
      onLongPress={() => run(true)}
      accessibilityRole="button"
      accessibilityLabel={`${t("media.open")} ${name}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, minHeight: 56, borderRadius: th.radius.md, backgroundColor: th.colors.muted, maxWidth: 340 }}
    >
      <MaterialCommunityIcons name={ICONS[ext] ?? "file-outline"} size={28} color={th.colors.foreground} />
      <Text numberOfLines={2} style={{ flex: 1, color: th.colors.foreground, fontSize: 14 }}>{name}</Text>
      {busy ? <ActivityIndicator accessibilityLabel={t("media.opening")} /> : <Text style={{ color: th.colors.primary, fontSize: 14, fontWeight: "600" }}>{t("media.open")}</Text>}
    </Pressable>
  );
}

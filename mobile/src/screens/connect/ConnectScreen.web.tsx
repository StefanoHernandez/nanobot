import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { BotFace } from "../../ui/BotFace";
import { Button, Dialog, IconButton, ListItem, TextField } from "../../ui/components";
import { pairedDevice } from "../../core/pairing";
import { profiles, type Profile } from "../../core/profiles";
import { webLogout } from "../../core/cookieBootstrap";
import { sessionStore } from "../../state/sessionStore";
import { i18n, useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";

export function defaultWebDeviceName(lang?: string): string {
  const currentLang = lang ?? (typeof i18n !== "undefined" ? i18n.language : "it");
  if (typeof navigator === "undefined" || !navigator.userAgent) {
    return "Browser";
  }
  const ua = navigator.userAgent;
  let browser = "";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";

  let os = "";
  if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iOS")) os = "iOS";
  else if (ua.includes("Mac OS") || ua.includes("Macintosh")) os = "macOS";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Linux")) os = "Linux";

  const prep = currentLang === "en" ? "on" : "su";
  const raw = os && browser
    ? `Browser – ${browser} ${prep} ${os}`
    : browser
    ? `Browser – ${browser}`
    : os
    ? `Browser ${prep} ${os}`
    : "Browser";
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned;
}

export function ConnectScreen() {
  const t = useT();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reason?: string }>();
  const sessionEnded = params.reason === "web_session_ended" || params.reason === "auth";

  const [tab, setTab] = useState<"code" | "secret">("code");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [name, setName] = useState(() => defaultWebDeviceName());
  const [errorMessage, setErrorMessage] = useState<string | undefined>(sessionEnded ? t("connect.webSessionEnded") : undefined);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<Profile[]>(() => profiles.list());
  const [toDelete, setToDelete] = useState<Profile | null>(null);
  const busy = useRef(false);

  const getOrigin = (): string => {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin.replace(/\/+$/, "");
    }
    return "http://localhost:8765";
  };

  const open = (id: string) => {
    profiles.setActive(id);
    void sessionStore.getState().open(id);
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
  };

  const submit = async () => {
    if (busy.current) return;
    setErrorMessage(undefined);
    busy.current = true;
    setLoading(true);

    const baseUrl = getOrigin();
    const endpoint = `${baseUrl}/api/ext/devices/web-login`;
    const deviceName = name.trim().slice(0, 40) || defaultWebDeviceName();
    const body = tab === "code" ? { code: code.trim(), name: deviceName } : { secret, name: deviceName };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      // Clear secret from memory immediately after request
      if (tab === "secret") setSecret("");

      if (res.status === 201) {
        const data = (await res.json()) as { id: string; name: string };
        const existing = list.find((p) => p.baseUrl === baseUrl);
        const profileId = existing?.id ?? crypto.randomUUID();
        const profileName = deviceName || (typeof window !== "undefined" ? window.location.host : "nanobot");

        await profiles.save({ id: profileId, name: profileName, baseUrl, auth: "cookie" });
        pairedDevice.set(profileId, data.id);
        open(profileId);
        return;
      }

      if (res.status === 401) {
        setErrorMessage(tab === "code" ? t("connect.badCode") : t("connect.badSecret"));
      } else if (res.status === 429) {
        setErrorMessage(t("connect.tooManyAttempts"));
      } else {
        setErrorMessage(t("common.operationFailed"));
      }
    } catch {
      if (tab === "secret") setSecret("");
      setErrorMessage(t("common.operationFailed"));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const wasActive = profiles.activeId() === toDelete.id;
    // A cookie profile is a registered device: revoke it, or the HttpOnly cookie stays valid.
    if (toDelete.auth === "cookie") await webLogout(toDelete.baseUrl).catch(() => {});
    await profiles.remove(toDelete.id);
    pairedDevice.clear(toDelete.id);
    if (wasActive) sessionStore.getState().close();
    setToDelete(null);
    setList(profiles.list());
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: th.colors.background }} behavior="padding">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
      >
        <View style={{ alignItems: "flex-start", gap: 14, marginBottom: 20, marginTop: 8 }}>
          <BotFace state={loading ? "thinking" : errorMessage ? "error" : "idle"} size={64} />
          <Text accessibilityRole="header" style={{ color: th.colors.foreground, fontFamily: th.font.display, fontSize: 28, lineHeight: 34 }}>
            {t("connect.title")}
          </Text>
        </View>

        {errorMessage ? (
          <View
            style={{
              backgroundColor: th.colors.card,
              borderColor: th.colors.destructive,
              borderWidth: 1,
              borderRadius: th.radius.md,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: th.colors.destructive, fontFamily: th.font.medium, fontSize: 14 }}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        {list.length > 0 ? (
          <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, overflow: "hidden", marginBottom: 20 }}>
            {list.map((p) => (
              <ListItem key={p.id} title={p.name} subtitle={p.baseUrl} onPress={() => open(p.id)} onLongPress={() => setToDelete(p)} />
            ))}
          </View>
        ) : null}

        {/* Tab Bar: Codice di abbinamento / Secret del server */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: th.colors.muted,
            borderRadius: th.radius.md,
            padding: 3,
            marginBottom: 20,
          }}
        >
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "code" }}
            onPress={() => {
              setTab("code");
              setErrorMessage(undefined);
            }}
            style={[
              styles.tabButton,
              tab === "code" && { backgroundColor: th.colors.card, borderRadius: th.radius.sm },
            ]}
          >
            <Text
              style={{
                fontFamily: tab === "code" ? th.font.medium : th.font.regular,
                fontSize: 14,
                color: tab === "code" ? th.colors.foreground : th.colors.mutedForeground,
              }}
            >
              {t("connect.pairingCodeTab")}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "secret" }}
            onPress={() => {
              setTab("secret");
              setErrorMessage(undefined);
            }}
            style={[
              styles.tabButton,
              tab === "secret" && { backgroundColor: th.colors.card, borderRadius: th.radius.sm },
            ]}
          >
            <Text
              style={{
                fontFamily: tab === "secret" ? th.font.medium : th.font.regular,
                fontSize: 14,
                color: tab === "secret" ? th.colors.foreground : th.colors.mutedForeground,
              }}
            >
              {t("connect.serverSecretTab")}
            </Text>
          </Pressable>
        </View>

        {tab === "code" ? (
          <>
            <TextField
              label={t("connect.pairingCode")}
              value={code}
              onChangeText={setCode}
              placeholder="PAIR-XXXXXX"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              helper={t("connect.pairingCodeHelp")}
            />
            <TextField
              label={t("connect.name")}
              value={name}
              onChangeText={(val) => setName(val.slice(0, 40))}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </>
        ) : (
          <>
            <TextField
              label={t("connect.secret")}
              value={secret}
              onChangeText={setSecret}
              secureTextEntry={!showSecret}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              helper={t("connect.secretHelp")}
              right={
                <IconButton
                  icon={showSecret ? "eye-off" : "eye"}
                  accessibilityLabel={t(showSecret ? "connect.hideSecret" : "connect.showSecret")}
                  onPress={() => setShowSecret((s) => !s)}
                />
              }
            />
            <TextField
              label={t("connect.name")}
              value={name}
              onChangeText={(val) => setName(val.slice(0, 40))}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </>
        )}

        <View style={{ marginTop: 8 }}>
          <Button title={t("connect.submit")} onPress={submit} loading={loading} />
        </View>
      </ScrollView>

      <Dialog
        open={!!toDelete}
        title={t("connect.deleteTitle")}
        message={t("connect.deleteConfirm", { name: toDelete?.name })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
});

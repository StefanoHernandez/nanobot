import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { normalizeBaseUrl, profiles, testConnection, type Profile } from "../../core/profiles";
import { sessionStore } from "../../state/sessionStore";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { Dialog, ListItem, toast } from "../../ui/components";
import { ProfileForm, type ProfileFormValues } from "./ProfileForm";

export function ConnectScreen() {
  const t = useT();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Profile[]>(() => profiles.list());
  // Redirected here by an auth_error: prefill the active profile (never its secret) and flag the secret.
  const authFailed = useLocalSearchParams<{ reason?: string }>().reason === "auth";
  const [values, setValues] = useState<ProfileFormValues>(() => {
    const p = authFailed ? profiles.list().find((x) => x.id === profiles.activeId()) : undefined;
    return { name: p?.name ?? "", url: p?.baseUrl ?? "", secret: "" };
  });
  const [urlError, setUrlError] = useState<string>();
  const [secretError, setSecretError] = useState<string | undefined>(authFailed ? t("connect.authError") : undefined);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<Profile | null>(null);
  const busy = useRef(false);

  const open = (id: string) => {
    profiles.setActive(id);
    void sessionStore.getState().open(id); // the session otherwise only opens at app start
    if (router.canDismiss()) router.dismissAll(); // no duplicate (main) under the new session
    router.replace("/");
  };

  const submit = async () => {
    if (busy.current) return;
    setUrlError(undefined);
    setSecretError(undefined);
    const baseUrl = normalizeBaseUrl(values.url);
    if (!baseUrl) return setUrlError(t("connect.invalidUrl"));
    busy.current = true;
    setLoading(true);
    try {
      const existing = list.find((p) => p.baseUrl === baseUrl);
      // save() with an empty secret DELETES the stored one, so keep it when the field is left blank
      const secret = values.secret || (existing?.hasSecret ? await profiles.getSecret(existing.id) : "");
      const r = await testConnection(baseUrl, secret);
      if (!r.ok) {
        if (r.kind === "auth") setSecretError(t("connect.authError"));
        else if (r.kind === "unreachable") setUrlError(t("connect.unreachable"));
        else toast.show(r.message);
        return;
      }
      const id = existing?.id ?? crypto.randomUUID();
      const name = values.name.trim() || existing?.name || new URL(baseUrl).host;
      await profiles.save({ id, name, baseUrl }, secret);
      open(id);
    } catch {
      // never surface the error text: it could contain the secret
      toast.show(t("common.error"));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const wasActive = profiles.activeId() === toDelete.id;
    await profiles.remove(toDelete.id);
    if (wasActive) sessionStore.getState().close(); // don't keep a live session (and its secret) for a deleted server
    setToDelete(null);
    setList(profiles.list());
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: th.colors.background }}
      behavior="padding"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
      >
        <Text accessibilityRole="header" style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 24, marginBottom: 16 }}>
          {t("connect.title")}
        </Text>
        {list.length === 0 ? (
          <Text style={{ color: th.colors.mutedForeground, marginBottom: 16 }}>{t("connect.empty")}</Text>
        ) : (
          list.map((p) => (
            <ListItem key={p.id} title={p.name} subtitle={p.baseUrl} onPress={() => open(p.id)} onLongPress={() => setToDelete(p)} />
          ))
        )}
        <ProfileForm values={values} onChange={setValues} urlError={urlError} secretError={secretError} loading={loading} onSubmit={submit} />
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

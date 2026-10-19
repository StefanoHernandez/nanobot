import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button, IconButton, TextField } from "../../ui/components";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";

export type ProfileFormValues = { name: string; url: string; secret: string };

export type ProfileFormProps = {
  values: ProfileFormValues;
  onChange: (v: ProfileFormValues) => void;
  urlError?: string;
  secretError?: string;
  loading: boolean;
  onSubmit: () => void;
  insecureWarning?: boolean;
  onConfirmInsecure?: () => void;
};

export function ProfileForm({
  values,
  onChange,
  urlError,
  secretError,
  loading,
  onSubmit,
  insecureWarning,
  onConfirmInsecure,
}: ProfileFormProps) {
  const t = useT();
  const th = useTheme();
  const [show, setShow] = useState(false);
  return (
    <>
      <TextField label={t("connect.name")} value={values.name} onChangeText={(name) => onChange({ ...values, name })} />
      <TextField
        label={t("connect.url")}
        value={values.url}
        onChangeText={(url) => onChange({ ...values, url })}
        placeholder="https://nome.tailnet.ts.net"
        autoCapitalize="none"
        keyboardType="url"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        error={urlError}
      />
      <TextField
        label={t("connect.secret")}
        value={values.secret}
        onChangeText={(secret) => onChange({ ...values, secret })}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        helper={t("connect.secretHelp")}
        error={secretError}
        right={
          <IconButton
            icon={show ? "eye-off" : "eye"}
            accessibilityLabel={t(show ? "connect.hideSecret" : "connect.showSecret")}
            onPress={() => setShow((s) => !s)}
          />
        }
      />
      {insecureWarning ? (
        <View
          testID="insecure-http-warning"
          style={{
            padding: 12,
            borderRadius: th.radius.md,
            backgroundColor: th.colors.muted,
            borderLeftWidth: 4,
            borderLeftColor: th.colors.brand,
            gap: 10,
            marginVertical: 4,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: th.colors.foreground, fontFamily: th.font.regular, fontSize: 14, lineHeight: 20 }}>
            {t("connect.insecureHttpWarning")}
          </Text>
          <Button
            title={t("connect.continueAnyway")}
            variant="secondary"
            onPress={() => onConfirmInsecure?.()}
            disabled={loading}
          />
        </View>
      ) : null}
      <Button title={t("connect.submit")} onPress={onSubmit} loading={loading} />
    </>
  );
}

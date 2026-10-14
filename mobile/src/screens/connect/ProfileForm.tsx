import React, { useState } from "react";
import { Button, IconButton, TextField } from "../../ui/components";
import { useT } from "../../i18n";

export type ProfileFormValues = { name: string; url: string; secret: string };

export type ProfileFormProps = {
  values: ProfileFormValues;
  onChange: (v: ProfileFormValues) => void;
  urlError?: string;
  secretError?: string;
  loading: boolean;
  onSubmit: () => void;
};

export function ProfileForm({ values, onChange, urlError, secretError, loading, onSubmit }: ProfileFormProps) {
  const t = useT();
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
      <Button title={t("connect.submit")} onPress={onSubmit} loading={loading} />
    </>
  );
}

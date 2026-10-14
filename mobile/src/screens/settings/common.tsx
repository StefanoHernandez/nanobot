import React from "react";
import { Text, View } from "react-native";
import { Button, IconButton, TextField } from "../../ui/components";
import { useTheme } from "../../ui/ThemeProvider";

export function Head({ children }: { children: string }) {
  const th = useTheme();
  return <Text style={{ color: th.colors.mutedForeground, fontSize: 13, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 }}>{children}</Text>;
}

/** Single-choice chips (>= 48 dp via Button). */
export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {options.map((o) => (
        <Button key={o.value} title={o.label} variant={o.value === value ? "primary" : "secondary"} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

/** API-key input: password field with show/hide toggle. */
export function SecretField({ label, value, onChangeText, error, showLabel, hideLabel }: {
  label: string; value: string; onChangeText: (v: string) => void; error?: string; showLabel: string; hideLabel: string;
}) {
  const [shown, setShown] = React.useState(false);
  return (
    <TextField
      label={label} value={value} onChangeText={onChangeText} error={error} secureTextEntry={!shown}
      autoCapitalize="none" autoCorrect={false} spellCheck={false}
      right={<IconButton icon={shown ? "eye-off" : "eye"} accessibilityLabel={shown ? hideLabel : showLabel} onPress={() => setShown((x) => !x)} />}
    />
  );
}

/** Write-only key: read-only hint with a pencil while a key is stored, password input while editing. */
export function HintSecretField({ label, hint, value, onChangeText, editing, onEdit, error, labels }: {
  label: string; hint?: string | null; value: string; onChangeText: (v: string) => void; editing: boolean; onEdit: (e: boolean) => void;
  error?: string; labels: { show: string; hide: string; edit: string; keep: string };
}) {
  const th = useTheme();
  if (hint && !editing) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: th.colors.foreground, fontSize: 13, marginBottom: 4 }}>{label}</Text>
          <Text style={{ color: th.colors.mutedForeground, fontSize: 15 }}>{hint}</Text>
        </View>
        <IconButton icon="pencil" accessibilityLabel={labels.edit} onPress={() => onEdit(true)} />
      </View>
    );
  }
  return (
    <>
      <SecretField label={label} value={value} onChangeText={onChangeText} error={error} showLabel={labels.show} hideLabel={labels.hide} />
      {hint ? <Button title={labels.keep} variant="ghost" onPress={() => (onEdit(false), onChangeText(""))} /> : null}
    </>
  );
}

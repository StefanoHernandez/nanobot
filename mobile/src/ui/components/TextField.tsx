import React from "react";
import { KeyboardTypeOptions, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { useTheme } from "../ThemeProvider";

export type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  helper?: string;
  error?: string;
  placeholder?: string;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  keyboardType?: KeyboardTypeOptions;
  right?: React.ReactNode;
} & Pick<TextInputProps, "autoCorrect" | "spellCheck" | "autoComplete" | "multiline" | "editable" | "onBlur">;

export function TextField({ label, value, onChangeText, secureTextEntry, helper, error, placeholder, autoCapitalize, keyboardType, right, ...passThrough }: TextFieldProps) {
  const th = useTheme();
  const c = th.colors;
  const msg = error ?? helper;
  return (
    <View style={styles.wrap}>
      <Text style={{ color: c.foreground, fontFamily: th.font.medium, fontSize: 14, marginBottom: 6 }}>{label}</Text>
      <View style={[styles.row, { borderColor: error ? c.destructive : c.input, borderRadius: th.radius.sm, backgroundColor: c.card }]}>
        <TextInput
          accessibilityLabel={label}
          style={[styles.input, { color: c.foreground, fontFamily: th.font.regular }]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          placeholder={placeholder}
          placeholderTextColor={c.mutedForeground}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          {...passThrough}
        />
        {right}
      </View>
      {msg ? <Text style={{ color: error ? c.destructive : c.mutedForeground, fontFamily: th.font.regular, fontSize: 13, marginTop: 4 }}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", borderWidth: 1, minHeight: 48, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 16, minHeight: 48 },
});

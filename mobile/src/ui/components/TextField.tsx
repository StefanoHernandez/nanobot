import React, { useState } from "react";
import { KeyboardTypeOptions, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from "react-native";
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
  mono?: boolean;
  inputStyle?: StyleProp<TextStyle>;
  rowStyle?: StyleProp<ViewStyle>;
} & Pick<TextInputProps, "autoCorrect" | "spellCheck" | "autoComplete" | "multiline" | "editable" | "onBlur" | "numberOfLines" | "maxLength" | "onSubmitEditing">;

export function TextField({ label, value, onChangeText, secureTextEntry, helper, error, placeholder, autoCapitalize, keyboardType, right, mono, inputStyle, rowStyle, onBlur, ...passThrough }: TextFieldProps) {
  const th = useTheme();
  const c = th.colors;
  const [focused, setFocused] = useState(false);
  const msg = error ?? helper;
  const borderColor = error ? c.destructive : focused ? c.borderStrong : c.border;
  return (
    <View style={styles.wrap}>
      {label ? <Text style={{ color: c.foreground, fontFamily: th.font.medium, fontSize: 14, marginBottom: 6 }}>{label}</Text> : null}
      <View style={[styles.row, { borderColor, borderRadius: th.radius.md, backgroundColor: c.input, borderWidth: 1 }, rowStyle]}>
        <TextInput
          accessibilityLabel={label || placeholder}
          style={[styles.input, { color: c.foreground, fontFamily: mono ? th.font.mono : th.font.regular }, inputStyle]}
          selectionColor={c.accentText}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          placeholder={placeholder}
          placeholderTextColor={c.textMuted}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...passThrough}
        />
        {right}
      </View>
      {msg ? <Text style={{ color: error ? c.destructive : c.textMuted, fontFamily: th.font.regular, fontSize: 13, marginTop: 4 }}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 16, minHeight: 48 },
});

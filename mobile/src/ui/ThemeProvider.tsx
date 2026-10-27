import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { kv } from "../platform/storage";
import { getTheme, parseAccentId, type AccentId, type Theme } from "./theme";

export type ThemePref = "system" | "light" | "dark";
const THEME_KEY = "ui.theme";
const ACCENT_KEY = "ui.accent";

const PrefCtx = createContext<[ThemePref, (p: ThemePref) => void]>(["system", () => {}]);
const AccentCtx = createContext<[AccentId, (a: AccentId) => void]>(["violet", () => {}]);

function loadPref(): ThemePref {
  const v = kv.get(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function loadAccent(): AccentId {
  return parseAccentId(kv.get(ACCENT_KEY));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>(loadPref);
  const [accent, setAccentState] = useState<AccentId>(loadAccent);

  const setPref = useCallback((p: ThemePref) => {
    kv.set(THEME_KEY, p);
    setPrefState(p);
  }, []);

  const setAccent = useCallback((a: AccentId) => {
    kv.set(ACCENT_KEY, a);
    setAccentState(a);
  }, []);

  const scheme: "light" | "dark" = pref === "system" ? (system === "dark" ? "dark" : "light") : pref;
  const theme = useMemo(() => getTheme(scheme, accent), [scheme, accent]);

  return (
    <PrefCtx.Provider value={[pref, setPref]}>
      <AccentCtx.Provider value={[accent, setAccent]}>
        <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>
      </AccentCtx.Provider>
    </PrefCtx.Provider>
  );
}

const ThemeCtx = createContext<Theme>(getTheme("light", "violet"));

export const useTheme = (): Theme => useContext(ThemeCtx);
export const useThemePreference = () => useContext(PrefCtx);
export const useAccentPreference = () => useContext(AccentCtx);

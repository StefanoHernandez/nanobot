import React, { createContext, useCallback, useContext, useState } from "react";
import { useColorScheme } from "react-native";
import { kv } from "../platform/storage";
import { darkTheme, lightTheme, type Theme } from "./theme";

export type ThemePref = "system" | "light" | "dark";
const KEY = "ui.theme";

const PrefCtx = createContext<[ThemePref, (p: ThemePref) => void]>(["system", () => {}]);

function loadPref(): ThemePref {
  const v = kv.get(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>(loadPref);
  const setPref = useCallback((p: ThemePref) => {
    kv.set(KEY, p);
    setPrefState(p);
  }, []);
  const scheme = pref === "system" ? (system ?? "light") : pref;
  return (
    <PrefCtx.Provider value={[pref, setPref]}>
      <ThemeCtx.Provider value={scheme === "dark" ? darkTheme : lightTheme}>{children}</ThemeCtx.Provider>
    </PrefCtx.Provider>
  );
}

const ThemeCtx = createContext<Theme>(lightTheme);

export const useTheme = (): Theme => useContext(ThemeCtx);
export const useThemePreference = () => useContext(PrefCtx);

import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { kv } from "../platform/storage";
import en from "./en.json";
import it from "./it.json";

// expo-localization is not installed; fall back to Intl as the brief allows.
const device = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0];
const saved = kv.get("pref.language");
const lng = saved === "it" || saved === "en" ? saved : device;

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, it: { translation: it } },
  lng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  initAsync: false,
});

export const i18n = i18next;
export const useT = () => useTranslation().t;

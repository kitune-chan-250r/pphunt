import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import ja from "./locales/ja";

export const supportedLanguages = ["ja", "en"] as const;
export type AppLanguage = (typeof supportedLanguages)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    fallbackLng: "ja",
    supportedLngs: [...supportedLanguages],
    load: "languageOnly",
    defaultNS: "translation",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "pphunt-language",
      caches: [],
    },
  });

export const getAppLanguage = (language: string | undefined): AppLanguage =>
  language?.toLowerCase().startsWith("en") ? "en" : "ja";

export const changeAppLanguage = (language: AppLanguage) => {
  try {
    window.localStorage.setItem("pphunt-language", language);
  } catch (error) {
    console.error("[i18n] Failed to save the selected language.", error);
  }
  return i18n.changeLanguage(language);
};

export default i18n;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof ja;
    };
    returnNull: false;
  }
}

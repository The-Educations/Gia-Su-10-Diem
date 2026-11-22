import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { en } from "./locales/en";
import { startTranslating, stopTranslating } from "./page-translator";

export type Lang = "vi" | "en";
const STORAGE_KEY = "giasu.lang";

type Params = Record<string, string | number>;
type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (vi: string, params?: Params) => string;
  ago: (date: string) => string;
};
const fill = (text: string, params?: Params) =>
  params ? text.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? "")) : text;
const parseTime = (value: string) =>
  new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").getTime();
const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
];

function relative(lang: Lang, value: string) {
  const seconds = Math.round((parseTime(value) - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, size] of steps)
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return lang === "en" ? "just now" : "vừa xong";
}

const I18nContext = createContext<I18n>({
  lang: "vi",
  setLang: () => {},
  t: (vi, params) => fill(vi, params),
  ago: (date) => relative("vi", date),
});

function storedLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    if (lang === "en") startTranslating();
    else stopTranslating();
  }, [lang]);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* The choice still applies to this visit when storage is unavailable. */
    }
  }, []);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (vi, params) => fill(lang === "en" ? en[vi] ?? vi : vi, params),
      ago: (date) => relative(lang, date),
    }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

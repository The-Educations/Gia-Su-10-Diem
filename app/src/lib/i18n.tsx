import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

// A language switch reuses the boot cover from index.html: it shows the drawn
// mark instantly, the DOM re-translates behind it, then boot-open reveals the
// page in the new language — the same branded transition as app start.
const MIN_COVER_MS = 700, COVER_OUT_MS = 280;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  const [cover, setCover] = useState(false);
  const coverAt = useRef(0);
  useEffect(() => {
    document.documentElement.lang = lang;
    if (lang === "en") startTranslating();
    else stopTranslating();
    if (!cover) return;
    const hold = Math.max(200, MIN_COVER_MS - (performance.now() - coverAt.current));
    const closeTimer = setTimeout(() => {
      const boot = document.getElementById("boot");
      if (boot) {
        boot.dataset.done = "";
        setTimeout(() => {
          boot.style.display = "none";
          delete boot.dataset.done;
          setCover(false);
        }, COVER_OUT_MS);
      } else {
        setCover(false);
      }
    }, hold);
    return () => clearTimeout(closeTimer);
  }, [lang, cover]);
  const setLang = useCallback(
    (next: Lang) => {
      if (next === lang) return;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* The choice still applies to this visit when storage is unavailable. */
      }
      const boot = document.getElementById("boot");
      if (navigator.webdriver || !boot) {
        setLangState(next);
        return;
      }
      // The cover must paint before the translation pass can block the thread.
      coverAt.current = performance.now();
      boot.style.display = "";
      setCover(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setLangState(next)));
    },
    [lang],
  );
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

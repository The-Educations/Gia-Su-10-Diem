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

// The language cover keeps the DOM re-translation behind a short brand pause:
// it paints first, the language flips on the next frames, and the cover lifts
// once the new text is on screen.
const MIN_COVER_MS = 700, COVER_OUT_MS = 220;
function LanguageCover({ closing }: { closing: boolean }) {
  return (
    <div className="lang-switch" data-done={closing || undefined} aria-hidden="true">
      <svg className="lang-switch-art" viewBox="0 0 240 240">
        <path className="ls-one" pathLength={1} d="M90 86 106 72v88" />
        <path className="ls-zero" pathLength={1} d="M152 72c-21 0-29 25-29 44 0 24 10 44 29 44s27-23 27-45c0-21-8-43-27-43" />
        <path className="ls-ring" pathLength={1} d="M60 122c-1-49 48-71 90-67 46 5 60 41 55 71-6 40-51 60-93 54-38-6-60-30-52-64 4-18 16-30 32-38" />
        <text className="ls-d" x="192" y="84">đ</text>
      </svg>
    </div>
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  const [cover, setCover] = useState<"open" | "closing" | null>(null);
  const coverAt = useRef(0);
  useEffect(() => {
    document.documentElement.lang = lang;
    if (lang === "en") startTranslating();
    else stopTranslating();
    if (!cover) return;
    const hold = Math.max(200, MIN_COVER_MS - (performance.now() - coverAt.current));
    const closeTimer = setTimeout(() => {
      setCover("closing");
      setTimeout(() => setCover(null), COVER_OUT_MS);
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
      if (navigator.webdriver) {
        setLangState(next);
        return;
      }
      // The cover must paint before the translation pass can block the thread.
      coverAt.current = performance.now();
      setCover("open");
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
  return (
    <I18nContext.Provider value={value}>
      {children}
      {cover && <LanguageCover closing={cover === "closing"} />}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);

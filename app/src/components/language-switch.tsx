import { useI18n, type Lang } from "@/lib/i18n";

const options: { lang: Lang; label: string; name: string }[] = [
  { lang: "vi", label: "VI", name: "Tiếng Việt" },
  { lang: "en", label: "EN", name: "Tiếng Anh" },
];

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="language-switch" role="group" aria-label={t("Ngôn ngữ")}>
      {options.map((option) => (
        <button
          key={option.lang}
          type="button"
          lang={option.lang}
          aria-pressed={lang === option.lang}
          title={t(option.name)}
          aria-label={t(option.name)}
          onClick={() => setLang(option.lang)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

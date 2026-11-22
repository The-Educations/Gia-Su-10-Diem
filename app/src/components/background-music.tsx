import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

const SRC = "/assets/audio/midnight-city.mp3";
const STORAGE_KEY = "giasu.backgroundMusic";
const VOLUME = 0.25;

const storedOn = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

/** A vinyl record: it spins while the music is really playing and stops when it is not. */
function Vinyl({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className="size-10 animate-spin motion-reduce:animate-none"
      style={{ animationDuration: "3s", animationPlayState: spinning ? "running" : "paused" }}
    >
      <circle cx="20" cy="20" r="20" fill="#1f1d19" />
      <circle cx="20" cy="20" r="16.5" fill="none" stroke="#fff" strokeOpacity=".1" />
      <circle cx="20" cy="20" r="13" fill="none" stroke="#fff" strokeOpacity=".1" />
      <path d="M20 3.5a16.5 16.5 0 0 1 14.3 8.25" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M20 36.5a16.5 16.5 0 0 1-14.3-8.25" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="20" cy="20" r="7" fill="var(--primary)" />
      <circle cx="20" cy="15.2" r="1.1" fill="#fffdfa" fillOpacity=".85" />
      <circle cx="20" cy="20" r="1.6" fill="var(--background)" />
    </svg>
  );
}

/**
 * Background music for the whole app. It sits in the app shell, so the song
 * keeps playing while the user moves between sections. Browsers block sound
 * before the first click or key press, so when the first play() is refused we
 * start the music on the user's first interaction.
 */
export function BackgroundMusic() {
  const { t } = useI18n();
  const [on, setOn] = useState(storedOn);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!on) return;
    const el = new Audio(SRC);
    el.loop = true;
    el.volume = VOLUME;
    const sync = () => setPlaying(!el.paused);
    const media = ["playing", "pause"] as const;
    media.forEach((e) => el.addEventListener(e, sync));
    const events = ["pointerdown", "keydown"] as const;
    let cancelled = false;
    const stopWaiting = () => events.forEach((e) => window.removeEventListener(e, start));
    function start() {
      el.play().then(stopWaiting, () => {});
    }
    el.play().catch(() => {
      // The refusal can arrive after the user already left the page.
      if (!cancelled) events.forEach((e) => window.addEventListener(e, start));
    });
    return () => {
      cancelled = true;
      stopWaiting();
      media.forEach((e) => el.removeEventListener(e, sync));
      el.pause();
      el.src = "";
      setPlaying(false);
    };
  }, [on]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      /* The choice still applies to this visit when storage is unavailable. */
    }
  };

  const label = t(on ? "Tắt nhạc nền" : "Bật nhạc nền");
  return (
    <button
      type="button"
      className={`fixed right-4 bottom-4 z-40 size-10 rounded-full shadow-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-opacity ${on ? "" : "opacity-50"}`}
      onClick={toggle}
      aria-label={label}
      aria-pressed={on}
      title={label}
    >
      <Vinyl spinning={playing} />
    </button>
  );
}

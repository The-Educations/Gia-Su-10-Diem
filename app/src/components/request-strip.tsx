import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLoad } from "@/lib/api";
import type { CommunityRequest, CommunityRequests } from "@/lib/types";
import { Person } from "@/components/common";
import { memberImageUrl } from "@/components/community/shared";

const SPEED = 45; // px per second, slow enough to read
const STILL = "(prefers-reduced-motion: reduce), (hover: none)";
const REDUCED = "(prefers-reduced-motion: reduce)";

// The The Educations ident takes over the strip now and then (docs/quang-cao-dai-chay.md).
const AD_EVERY = 45_000; // at least this long between two showings
const AD_STILL_FOR = 6_000; // how long the still frame stays when motion is reduced or the video fails
const AD_MAX = 12_000; // the ident is 8 s; never hold the strip longer than this
const AD_FADE = 240; // matches the CSS fade
const AD_RETRY = 2_000; // the reader is busy with the strip or the tab is hidden: ask again later
const AD_VIDEO = "/assets/video/the-educations-ident.mp4";
const AD_POSTER = "/assets/video/the-educations-ident.png";
const AD_LABEL = "The Educations. Làm Giáo Dục, vì Giáo Dục. Make EDU, for EDU";
const AD_KEY = "giasu.tickerAd.lastShown";

function useMedia(query: string) {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === "function" && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query),
      sync = () => setMatches(list.matches);
    sync();
    list.addEventListener("change", sync);
    return () => list.removeEventListener("change", sync);
  }, [query]);
  return matches;
}

// The pause between showings carries across reloads in the same tab, so a reload does not replay it.
const lastShown = () => {
  try {
    const value = Number(sessionStorage.getItem(AD_KEY));
    if (value > 0) return value;
  } catch {
    /* storage blocked: count from page load */
  }
  return null;
};
const rememberShown = (at: number) => {
  try {
    sessionStorage.setItem(AD_KEY, String(at));
  } catch {
    /* storage blocked: the pause then restarts on reload */
  }
};

// Milliseconds until the post at the left edge of the running strip has fully scrolled out, so the
// ident never cuts a post in half. The strip moves one list width per animation cycle.
function untilNextExit(track: HTMLElement, list: HTMLElement) {
  const animation = track.getAnimations()[0],
    cycle = Number(animation?.effect?.getTiming().duration),
    time = Number(animation?.currentTime),
    width = list.offsetWidth;
  if (!animation || !(cycle > 0) || !(time >= 0) || !width) return 0;
  const shift = ((time % cycle) / cycle) * width,
    ends = Array.from(list.children, (li) => {
      const item = li as HTMLElement;
      return item.offsetLeft - list.offsetLeft + item.offsetWidth;
    }),
    next = ends.find((end) => end > shift) ?? (ends[0] ?? 0) + width;
  return ((next - shift) / width) * cycle + 50;
}

/**
 * The 8-second The Educations ident. It only shows itself: clicking it does nothing. With reduced
 * motion, or when the video cannot play, the last frame stays for a few seconds instead.
 */
function BrandAd({ reduced, leaving, onDone }: { reduced: boolean; leaving: boolean; onDone: () => void }) {
  const [still, setStill] = useState(reduced);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = setTimeout(() => done.current(), still ? AD_STILL_FOR : AD_MAX);
    return () => clearTimeout(timer);
  }, [still]);
  return (
    <div className="ticker-ad" role="img" aria-label={AD_LABEL} data-leaving={leaving || undefined}>
      {still ? (
        <img src={AD_POSTER} alt="" draggable={false} />
      ) : (
        <video
          src={AD_VIDEO}
          muted
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden="true"
          tabIndex={-1}
          onEnded={() => done.current()}
          onError={() => setStill(true)}
        />
      )}
    </div>
  );
}

const roleLabel = (tier: string) =>
  tier === "parent" ? "Phụ huynh" : tier === "tutor" ? "Gia sư" : "Học sinh";

// Gia sư thấy bài của học sinh/phụ huynh tìm gia sư; học sinh/phụ huynh thấy bài của
// gia sư tìm học sinh.
const STRIPS = {
  tutor: { label: "Đang tìm gia sư", search: "tìm gia sư" },
  student: { label: "Gia sư đang tìm học sinh", search: "tìm học sinh" },
};

function Item({ item, hidden }: { item: CommunityRequest; hidden?: boolean }) {
  const { author } = item,
    topic = [item.subject, item.level].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        className="ticker-item"
        to={`/community/${item.id}`}
        tabIndex={hidden ? -1 : undefined}
        aria-label={`${author.name_part}, ${roleLabel(author.tier)}${topic ? `, ${topic}` : ""}: ${item.title}${item.summary ? `. ${item.summary}` : ""}`}
      >
        <Person
          name={author.name_part}
          src={author.has_avatar ? memberImageUrl(author, "avatar") : undefined}
        />
        <strong>{author.name_part}</strong>
        {topic && <span className="ticker-topic">{topic}</span>}
        <span className="ticker-text">
          {item.title}
          {item.summary && <span className="ticker-summary"> — {item.summary}</span>}
        </span>
      </Link>
    </li>
  );
}

// Accounts with no posts to scroll (an admin, or a tutor, student or parent when nobody has
// posted) get the ident on its own. It plays once when the page opens, then its last frame
// stays on screen and it plays again every 45 s.
function AloneAd() {
  const reduced = useMedia(REDUCED),
    video = useRef<HTMLVideoElement>(null),
    [failed, setFailed] = useState(false),
    [rest, setRest] = useState(false);
  useEffect(() => {
    const el = video.current;
    if (!rest || !el) return;
    let timer: ReturnType<typeof setTimeout>;
    const replay = () => {
      if (document.hidden) return void (timer = setTimeout(replay, AD_RETRY));
      setRest(false);
      el.currentTime = 0;
      el.play().catch(() => setRest(true));
    };
    timer = setTimeout(replay, AD_EVERY);
    return () => clearTimeout(timer);
  }, [rest]);
  return (
    <div className="topbar-ticker" data-alone>
      <div className="ticker-ad" role="img" aria-label={AD_LABEL}>
        {reduced || failed ? (
          <img src={AD_POSTER} alt="" draggable={false} />
        ) : (
          <video
            ref={video}
            src={AD_VIDEO}
            poster={AD_POSTER}
            muted
            autoPlay
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            aria-hidden="true"
            tabIndex={-1}
            onEnded={() => setRest(true)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}

// Ticker in the top bar: recent community posts scroll from right to left, each as
// an avatar plus a short summary; a click opens the whole post in the community. A
// tutor sees students' and parents' "looking for a tutor" posts, a student or parent
// sees tutors' "looking for students" posts.
//
// Every 45 s or so, once the post at the left edge has scrolled out, the strip hides
// and the The Educations ident plays in its place, then the posts carry on from where
// they stopped.
export function RequestStrip({ role }: { role: "tutor" | "student" | null }) {
  // An admin has no posts to show, so nothing is fetched. Until the list has loaded the bar
  // stays empty, so the ident does not flash before the posts take over.
  const { data, error } = useLoad<CommunityRequests>(role ? "/community/requests" : null);
  if (role && !data && !error) return null;
  const items = error ? [] : data?.items ?? [];
  if (!role || !items.length) return <AloneAd />;
  return <PostsStrip role={role} items={items} />;
}

function PostsStrip({ role, items }: { role: "tutor" | "student"; items: CommunityRequest[] }) {
  const strip = STRIPS[role],
    still = useMedia(STILL),
    reduced = useMedia(REDUCED),
    section = useRef<HTMLElement>(null),
    frame = useRef<HTMLDivElement>(null),
    track = useRef<HTMLDivElement>(null),
    list = useRef<HTMLUListElement>(null),
    [width, setWidth] = useState({ list: 0, frame: 0 }),
    [ad, setAd] = useState<"off" | "on" | "leaving">("off"),
    since = useRef(lastShown() ?? Date.now());
  useEffect(() => {
    const f = frame.current,
      l = list.current;
    if (!f || !l) return;
    const measure = () =>
      setWidth({ list: l.offsetWidth, frame: f.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(f);
    observer.observe(l);
    return () => observer.disconnect();
  }, [items.length]);
  // Even one long summary does not fit the bar, so it runs whenever it overflows.
  const marquee = !still && width.list > width.frame;

  // Schedule the next showing while the posts are on screen.
  useEffect(() => {
    if (ad !== "off") return;
    let timer: ReturnType<typeof setTimeout>;
    const busy = () =>
      document.hidden || !!section.current?.matches(":hover, :focus-within");
    const show = () => {
      if (busy()) return void (timer = setTimeout(show, AD_RETRY));
      setAd("on");
    };
    const waitForGap = () => {
      if (busy()) return void (timer = setTimeout(waitForGap, AD_RETRY));
      const t = track.current,
        l = list.current;
      timer = setTimeout(show, marquee && t && l ? untilNextExit(t, l) : 0);
    };
    timer = setTimeout(waitForGap, Math.max(since.current + AD_EVERY - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [ad, marquee]);

  // The ident ended: fade it out, then hand the strip back to the posts.
  const finish = () => {
    if (ad !== "on") return;
    since.current = Date.now();
    rememberShown(since.current);
    setAd("leaving");
  };
  useEffect(() => {
    if (ad !== "leaving") return;
    const timer = setTimeout(() => setAd("off"), reduced ? 0 : AD_FADE);
    return () => clearTimeout(timer);
  }, [ad, reduced]);

  return (
    <section
      className="topbar-ticker"
      aria-label={strip.label}
      data-ad={ad !== "off" ? ad : undefined}
      ref={section}
    >
      <Link
        className="ticker-label"
        to={`/community?q=${encodeURIComponent(strip.search)}`}
      >
        {strip.label}
      </Link>
      <div
        className="ticker-frame"
        data-mode={marquee ? "marquee" : "static"}
        ref={frame}
      >
        <div
          className="ticker-track"
          ref={track}
          style={
            marquee
              ? ({ "--ticker-duration": `${Math.max(width.list / SPEED, 1)}s` } as React.CSSProperties)
              : undefined
          }
        >
          <ul ref={list}>
            {items.map((item) => (
              <Item key={item.id} item={item} />
            ))}
          </ul>
          {marquee && (
            <ul aria-hidden="true">
              {items.map((item) => (
                <Item key={item.id} item={item} hidden />
              ))}
            </ul>
          )}
        </div>
      </div>
      {ad !== "off" && <BrandAd reduced={reduced} leaving={ad === "leaving"} onDone={finish} />}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLoad } from "@/lib/api";
import type { CommunityRequest, CommunityRequests } from "@/lib/types";
import { Person } from "@/components/common";
import { memberImageUrl } from "@/components/community/shared";

const SPEED = 45; // px per second, slow enough to read
const STILL = "(prefers-reduced-motion: reduce), (hover: none)";

// Reduced motion and touch screens: no hover to pause on, so show a swipeable row.
function useStill() {
  const [still, setStill] = useState(
    () => typeof matchMedia === "function" && matchMedia(STILL).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(STILL),
      sync = () => setStill(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return still;
}

const roleLabel = (tier: string) => (tier === "parent" ? "Phụ huynh" : "Học sinh");

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

// Ticker in the top bar of a tutor's workspace: recent "looking for a tutor" posts
// scroll from right to left, each as an avatar plus a short summary; a click opens
// the whole post in the community. It is an extra: while loading, on error or with
// nothing to show it renders nothing.
export function RequestStrip() {
  const { data, error } = useLoad<CommunityRequests>("/community/requests"),
    items = data?.items ?? [],
    still = useStill(),
    frame = useRef<HTMLDivElement>(null),
    list = useRef<HTMLUListElement>(null),
    [width, setWidth] = useState({ list: 0, frame: 0 });
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
  if (error || !items.length) return null;
  // Even one long summary does not fit the bar, so it runs whenever it overflows.
  const marquee = !still && width.list > width.frame;
  return (
    <section className="topbar-ticker" aria-label="Đang tìm gia sư">
      <Link
        className="ticker-label"
        to={`/community?q=${encodeURIComponent("tìm gia sư")}`}
      >
        Đang tìm gia sư
      </Link>
      <div
        className="ticker-frame"
        data-mode={marquee ? "marquee" : "static"}
        ref={frame}
      >
        <div
          className="ticker-track"
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
    </section>
  );
}

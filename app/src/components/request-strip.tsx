import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useLoad } from "@/lib/api";
import type { CommunityRequest, CommunityRequests } from "@/lib/types";
import { Person } from "@/components/common";
import { memberImageUrl } from "@/components/community/shared";

const SPEED = 30; // px per second
const MARQUEE_MIN = 4; // fewer cards than this stay still
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

function Card({ item, hidden }: { item: CommunityRequest; hidden?: boolean }) {
  const { author } = item,
    topic = [item.subject, item.level].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        className="request-card"
        to={`/community/${item.id}`}
        tabIndex={hidden ? -1 : undefined}
        aria-label={`${author.name_part}${topic ? `, ${topic}` : ""}: ${item.title}`}
      >
        <span className="request-card-author">
          <Person
            name={author.name_part}
            src={author.has_avatar ? memberImageUrl(author, "avatar") : undefined}
          />
          <span>
            <strong>{author.name_part}</strong> · {roleLabel(author.tier)}
          </span>
        </span>
        {topic && <span className="request-card-topic">{topic}</span>}
        <span className="request-card-title">{item.title}</span>
      </Link>
    </li>
  );
}

// Strip of recent "looking for a tutor" posts on the tutor dashboard. It is an
// extra: while loading, on error or with nothing to show it renders nothing.
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
  const marquee =
    !still && items.length >= MARQUEE_MIN && width.list > width.frame;
  return (
    <section className="request-strip" aria-labelledby="request-strip-title">
      <header>
        <h2 id="request-strip-title">Đang tìm gia sư</h2>
        <Link
          className="text-link"
          to={`/community?q=${encodeURIComponent("tìm gia sư")}`}
        >
          Xem tất cả <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </header>
      <div
        className="request-strip-frame"
        data-mode={marquee ? "marquee" : "static"}
        ref={frame}
      >
        <div
          className="request-strip-track"
          style={
            marquee
              ? ({ "--request-strip-duration": `${Math.max(width.list / SPEED, 1)}s` } as React.CSSProperties)
              : undefined
          }
        >
          <ul ref={list}>
            {items.map((item) => (
              <Card key={item.id} item={item} />
            ))}
          </ul>
          {marquee && (
            <ul aria-hidden="true">
              {items.map((item) => (
                <Card key={item.id} item={item} hidden />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

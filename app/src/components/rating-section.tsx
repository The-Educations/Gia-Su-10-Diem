import { Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Tutor } from "@/lib/types";
import { Section } from "./common";

type Rating = { average: number | null; count: number; counts: number[]; reviews: { rating: number; body: string; lessons: number; author: string }[] };

// Public stars come from students' private lesson ratings, published when a package ends.
export function RatingSection({ tutor }: { tutor: Tutor & { rating?: Rating } }) {
  const { t } = useI18n(), r = tutor.rating;
  if (!r) return null;
  const max = Math.max(1, ...r.counts);
  return (
    <Section title={t("Đánh giá ({n})", { n: r.count })}>
      {r.count ? (
        <div className="rating-summary">
          <div className="rating-big"><strong>{r.average?.toFixed(1)}</strong><Stars value={r.average || 0} /><span>{t("{n} gói học đã hoàn thành", { n: r.count })}</span></div>
          <ul className="rating-bars">{r.counts.map((n, i) => <li key={i}><span>{5 - i}</span><Star aria-hidden="true" /><i><b style={{ width: `${(n / max) * 100}%` }} /></i><small>{n}</small></li>)}</ul>
        </div>
      ) : <p className="muted">{t("Chưa có đánh giá. Số sao hiện sau khi học sinh hoàn thành gói học.")}</p>}
      {r.reviews.filter((x) => x.body).map((x, i) => (
        <article className="review" key={i}>
          <header><strong>{x.author}</strong><Stars value={x.rating} /><span className="muted">{t("Đã học {n} buổi", { n: x.lessons })}</span></header>
          <p>{x.body}</p>
        </article>
      ))}
    </Section>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-label={`${value.toFixed(1)}/5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} aria-hidden="true" data-on={value >= n - 0.25 || undefined} />)}
    </span>
  );
}

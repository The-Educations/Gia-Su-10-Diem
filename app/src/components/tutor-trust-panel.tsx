import { useLoad } from "@/lib/api";
import { Loading, ErrorState, Section } from "@/components/common";
import { formatScore } from "@/components/trust";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n";

type TrustDetail = {
  score: number | null; is_new: boolean; review_count: number; punctuality: number | null;
  quality: number; pairs: number; reliability: number; held: number; bad: number;
  lesson_avg: number | null; lesson_count: number;
  progress: { ratings: number; raters: number; need_ratings: number; need_raters: number };
  tag_counts: { code: string; label: string; count: number }[];
  bad_breakdown: { late_cancels: number; no_shows: number };
  reviews: { author: string; rating: number; body: string; created_at: string; lessons: number }[];
  policy: Record<string, number>;
};

// The tutor's own breakdown of the trust score: totals only, never who rated which lesson.
export function TutorTrustPanel() {
  const { t } = useI18n();
  const result = useLoad<TrustDetail>("/tutor/trust");
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  const d = result.data, p = d.policy;
  return <div className="trust-panel">
    <Section title="Điểm hiện tại">
      <div className="trust-headline">
        <strong>{d.is_new || d.score === null ? "Mới" : `${formatScore(d.score)} / 5`}</strong>
        <span>{d.is_new
          ? `Hồ sơ hiện nhãn “Mới” cho đến khi có ít nhất ${d.progress.need_ratings} lượt chấm từ ${d.progress.need_raters} học sinh khác nhau.`
          : `${d.review_count} đánh giá cuối khóa công khai.`}</span>
      </div>
      {d.is_new && <div className="trust-progress">
        <label>Lượt chấm: {Math.min(d.progress.ratings, d.progress.need_ratings)}/{d.progress.need_ratings}<Progress value={Math.min(100, d.progress.ratings / d.progress.need_ratings * 100)} /></label>
        <label>Học sinh khác nhau: {Math.min(d.progress.raters, d.progress.need_raters)}/{d.progress.need_raters}<Progress value={Math.min(100, d.progress.raters / d.progress.need_raters * 100)} /></label>
      </div>}
    </Section>
    <Section title="Chi tiết">
      <dl className="trust-facts">
        <div><dt>{t("Chất lượng (Q)")}</dt><dd>{formatScore(d.quality)} / 5 <small>từ {d.pairs} học sinh</small></dd></div>
        <div><dt>{t("Độ giữ hẹn (R)")}</dt><dd>{Math.round(d.reliability * 100)}% <small>{d.held} buổi hoàn thành · {d.bad_breakdown.late_cancels} lần hủy sát giờ · {d.bad_breakdown.no_shows} lần không đến</small></dd></div>
        <div><dt>{t("Chấm sau từng buổi")}</dt><dd>{d.lesson_avg === null ? "Chưa có" : `${formatScore(d.lesson_avg)} / 5`} <small>{d.lesson_count} lượt</small></dd></div>
      </dl>
      <h3>{t("Nhãn học sinh đã chọn")}</h3>
      <ul className="trust-tags">{d.tag_counts.map(t => <li key={t.code}>{t.label} <span>{t.count}</span></li>)}</ul>
      <p className="muted">Bạn chỉ thấy số liệu tổng hợp. Nhãn chỉ hiện công khai khi có từ {p.PUBLIC_TAG_MIN} lượt chọn.</p>
    </Section>
    <Section title="Đánh giá cuối khóa công khai">
      {d.reviews.length ? d.reviews.map((r, i) => <article className="review" key={i}><strong>{r.author}</strong><span>{r.rating}/5</span>{!!r.lessons && <span className="muted">Đã học {r.lessons} buổi</span>}{!!r.body && <p>{r.body}</p>}</article>) : <p className="muted">{t("Chưa có đánh giá cuối khóa.")}</p>}
    </Section>
    <Section title="Điểm được tính thế nào">
      <ul className="trust-how">
        <li>Mỗi học sinh chỉ góp một phiếu. Điểm của họ = (đánh giá cuối khóa × {p.COURSE_WEIGHT} + trung bình chấm từng buổi) ÷ {p.COURSE_WEIGHT + 1}.</li>
        <li>Chất lượng Q = (tổng điểm các học sinh + {p.PRIOR_WEIGHT} × {String(p.PRIOR_MEAN).replace(".", ",")}) ÷ (số học sinh + {p.PRIOR_WEIGHT}). Ít đánh giá thì Q gần mức nền {String(p.PRIOR_MEAN).replace(".", ",")}.</li>
        <li>Độ giữ hẹn R = số buổi hoàn thành ÷ (số buổi hoàn thành + lần hủy sát giờ trong {p.LATE_CANCEL_HOURS} giờ + lần gia sư không đến). Học sinh hủy, học sinh vắng và khóa học kết thúc sớm không bị tính.</li>
        <li>Điểm = {Math.round(p.QUALITY_SHARE * 100)}% chất lượng + {Math.round(p.RELIABILITY_SHARE * 100)}% độ giữ hẹn, quy về thang 5 sao.</li>
        <li>“Đúng hẹn %” chỉ hiện khi có từ {p.PUNCTUALITY_MIN_LESSONS} buổi được tính.</li>
      </ul>
    </Section>
  </div>;
}

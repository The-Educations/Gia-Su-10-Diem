import type { Tutor, Subject } from "@/lib/types";
import { TutorPresentation } from "./tutor-presentation";
import { TutorGallery } from "./tutor-gallery";
import { TutorContactSchedule } from "./tutor-contact-schedule";
import { Section } from "./common";
import { ProposalComposer } from "./proposal-composer";

export function TutorProfileView({ tutor: t, subjects, preview = false }: { tutor: Tutor; subjects: Subject[]; preview?: boolean }) {
  return <div className="profile-layout weekly-profile-layout">
    <div>
      <TutorPresentation tutor={t} subjects={subjects} />
      <TutorGallery images={t.gallery || []} name={t.name} />
      <Section title={`Đánh giá (${t.reviews.length})`}>
        <p className="muted review-basis">Điểm tính từ đánh giá sau từng buổi, đánh giá cuối khóa và việc giữ lịch hẹn.</p>
        {t.trust.tags.length > 0 && <ul className="trust-tags" aria-label="Học sinh thường nhận xét">{t.trust.tags.map(tag => <li key={tag.code}>{tag.label} <span>{tag.count}</span></li>)}</ul>}
        {t.reviews.length ? t.reviews.map((r, i) => <article className="review" key={i}><strong>{r.author}</strong><span>{r.rating}/5</span>{!!r.lessons && <span className="muted">Đã học {r.lessons} buổi</span>}{!!r.body && <p>{r.body}</p>}</article>) : <p className="muted">Chưa có đánh giá cuối khóa.</p>}
      </Section>
    </div>
    <div className="profile-side">
      {!preview && <div className="proposal-card-cta"><strong>{t.name}</strong><span>{new Intl.NumberFormat("vi-VN").format(t.rate)}đ / buổi</span><ProposalComposer tutor={t} subjects={subjects} /></div>}
      <TutorContactSchedule key={t.user_id} tutor={t} subjects={subjects} preview={preview} />
    </div>
  </div>;
}

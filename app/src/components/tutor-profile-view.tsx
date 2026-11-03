import type { Tutor, Subject } from "@/lib/types";
import { TutorPresentation } from "./tutor-presentation";
import { TutorGallery } from "./tutor-gallery";
import { TutorContactSchedule } from "./tutor-contact-schedule";
import { Section } from "./common";

export function TutorProfileView({ tutor: t, subjects, preview = false }: { tutor: Tutor; subjects: Subject[]; preview?: boolean }) {
  return <div className="profile-layout weekly-profile-layout">
    <div>
      <TutorPresentation tutor={t} subjects={subjects} />
      <TutorGallery images={t.gallery || []} name={t.name} />
      <Section title={`Đánh giá (${t.reviews.length})`}>
        {t.reviews.length ? t.reviews.map((r, i) => <article className="review" key={i}><strong>{r.name}</strong><span>{r.rating}/5</span><p>{r.body}</p></article>) : <p className="muted">Chưa có đánh giá từ buổi học đã hoàn thành.</p>}
      </Section>
    </div>
    <TutorContactSchedule key={t.user_id} tutor={t} subjects={subjects} preview={preview} />
  </div>;
}

import type { Tutor, Subject } from "@/lib/types";
import { TutorPresentation } from "./tutor-presentation";
import { TutorGallery } from "./tutor-gallery";
import { ContactTutor } from "./contact-tutor";
import { WeeklyLessonRequest } from "./weekly-lesson-request";
import { Section } from "./common";
import { Button } from "./ui/button";
import { MessageCircle } from "lucide-react";

export function TutorProfileView({ tutor: t, subjects, preview = false }: { tutor: Tutor; subjects: Subject[]; preview?: boolean }) {
  return <div className="profile-layout weekly-profile-layout">
    <div>
      <TutorPresentation tutor={t} subjects={subjects}>
        <div className="profile-actions">{preview ? <Button disabled><MessageCircle />Liên hệ gia sư</Button> : <ContactTutor tutor={t} />}</div>
      </TutorPresentation>
      <TutorGallery images={t.gallery || []} name={t.name} />
      <Section title={`Đánh giá (${t.reviews.length})`}>
        {t.reviews.length ? t.reviews.map((r, i) => <article className="review" key={i}><strong>{r.name}</strong><span>{r.rating}/5</span><p>{r.body}</p></article>) : <p className="muted">Chưa có đánh giá từ buổi học đã hoàn thành.</p>}
      </Section>
    </div>
    <WeeklyLessonRequest key={t.user_id} tutor={t} subjects={subjects} preview={preview} />
  </div>;
}

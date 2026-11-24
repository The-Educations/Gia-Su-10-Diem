import type { Tutor, Subject } from "@/lib/types";
import { TutorPresentation } from "./tutor-presentation";
import { TutorGallery } from "./tutor-gallery";
import { BookingCard } from "./booking-card";
import { RatingSection } from "./rating-section";

export function TutorProfileView({ tutor: t, subjects, preview = false }: { tutor: Tutor; subjects: Subject[]; preview?: boolean }) {
  return <TutorPresentation tutor={t} subjects={subjects} preview={preview} aside={!preview ? <BookingCard tutor={t} subjects={subjects} /> : undefined}>
    <TutorGallery images={t.gallery || []} name={t.name} />
    <RatingSection tutor={t} />
  </TutorPresentation>;
}

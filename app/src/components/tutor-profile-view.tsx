import type { Tutor, Subject } from "@/lib/types";
import { TutorPresentation } from "./tutor-presentation";
import { TutorGallery } from "./tutor-gallery";
import { Section } from "./common";
import { BookingCard } from "./booking-card";
import { RatingSection } from "./rating-section";

export function TutorProfileView({ tutor: t, subjects, preview = false }: { tutor: Tutor; subjects: Subject[]; preview?: boolean }) {
  return <div className="profile-layout weekly-profile-layout">
    <div>
      <TutorPresentation tutor={t} subjects={subjects} />
      <TutorGallery images={t.gallery || []} name={t.name} />
      <RatingSection tutor={t} />
    </div>
    {!preview && <div className="profile-side"><BookingCard tutor={t} subjects={subjects} /></div>}
  </div>;
}

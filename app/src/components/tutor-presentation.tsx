import type { ReactNode } from "react";
import { GraduationCap, MapPin, Star } from "lucide-react";
import type { Tutor, Subject } from "@/lib/types";
import { Person, Section } from "@/components/common";
import { Badge } from "@/components/ui/badge";

export function TutorPresentation({
  tutor: t,
  subjects,
  preview = false,
  children,
}: {
  tutor: Tutor;
  subjects: Subject[];
  preview?: boolean;
  children?: ReactNode;
}) {
  const Title = preview ? "h3" : "h1";
  return (
    <article
      className="tutor-presentation"
      data-theme={t.profile_theme || "paper"}
    >
      <div className="tutor-cover" aria-hidden="true">
        <span>10</span>
      </div>
      <div className="profile-hero">
        <Person
          name={t.name}
          id={t.user_id}
          src={t.photo_url || undefined}
          large
        />
        <div>
          <Title>{t.name}</Title>
          <p className="tutor-headline">{t.headline}</p>
          <div className="subject-tags">
            {t.subjects.map((id) => (
              <Badge variant="secondary" key={id}>
                {subjects.find((s) => s.id === id)?.name || id}
              </Badge>
            ))}
            {!preview && (
              <Badge variant="outline">
                {t.demo ? "Hồ sơ minh họa" : "Đã được quản trị duyệt"}
              </Badge>
            )}
          </div>
        </div>
      </div>
      {children}
      <div className="profile-meta">
        <span>
          <GraduationCap />
          {t.experience} năm kinh nghiệm
        </span>
        <span>
          <MapPin />
          {t.location}
        </span>
        {!preview && (
          <span>
            <Star />
            {t.review_count ? `${t.rating.toFixed(1)} / 5` : "Chưa có đánh giá"}
          </span>
        )}
      </div>
      {t.bio && (
        <Section title="Về gia sư">
          <p className="reading-text">{t.bio}</p>
        </Section>
      )}
      {(t.levels.length > 0 || t.goals.length > 0) && (
        <Section title="Nhận dạy">
          <p>{t.levels.join(" · ")}</p>
          {t.goals.length > 0 && <p className="muted">{t.goals.join(" · ")}</p>}
        </Section>
      )}
      {t.education && (
        <Section title="Học vấn">
          <p className="reading-text">{t.education}</p>
        </Section>
      )}
      {t.teaching_style && (
        <Section title="Phương pháp giảng dạy">
          <p className="reading-text">{t.teaching_style}</p>
        </Section>
      )}
      {t.lesson_plan && (
        <Section title="Một buổi học cùng tôi">
          <p className="reading-text">{t.lesson_plan}</p>
        </Section>
      )}
      {!!t.demo && (
        <p className="demo-note">
          Hồ sơ, ảnh và CV minh họa cho trải nghiệm sản phẩm.
        </p>
      )}
    </article>
  );
}

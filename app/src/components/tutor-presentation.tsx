import { TrustLine } from "@/components/trust";
import { EducationTimeline } from "./tutor-education";
import { TimezoneTag } from "./tutor-timezone";
import { ProfileSections } from "./tutor-sections";
import type { ReactNode } from "react";
import { Award, BadgeCheck, GraduationCap, MapPin, ScrollText } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { embedUrl } from "@/lib/video";
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
  const { t: tr } = useI18n();
  const Title = preview ? "h3" : "h1";
  const video = t.intro_video ? embedUrl(t.intro_video) : null;
  const kind = { student: "Sinh viên", teacher: "Giáo viên", professional: "Người đi làm" }[t.tutor_kind as string];
  return (
    <article
      className="tutor-presentation"
      data-theme={t.profile_theme || "paper"}
    >
      {t.banner_url && <div className="tutor-cover"><img src={t.banner_url} alt={`Ảnh bìa của ${t.name}`} /></div>}
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
            {kind && <Badge variant="outline">{tr(kind)}</Badge>}
            <TimezoneTag zone={t.timezone || "Asia/Ho_Chi_Minh"} />
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
          <TrustLine trust={t.trust} />
        )}
      </div>
      {!!t.verified?.length && (
        <Section title={tr("Đã xác minh")}>
          <ul className="verified-list">
            {t.verified.map((v, i) => {
              const Icon = v.kind === "school" ? GraduationCap : v.kind === "award" ? Award : ScrollText;
              return (
                <li key={i}>
                  <Icon aria-hidden="true" />
                  <span>{v.label}</span>
                  <BadgeCheck className="verified-mark" aria-label={tr("Đã đối chiếu minh chứng")} />
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {video && (
        <Section title={tr("Video giới thiệu")}>
          <div className="intro-video">
            <iframe src={video} title={tr("Video giới thiệu của {name}", { name: t.name })} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          </div>
        </Section>
      )}
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
      {(t.education || t.education_history?.length > 0) && (
        <Section title="Học vấn">
          {t.education && <p className="reading-text">{t.education}</p>}
          {!!t.education_history?.length && <EducationTimeline entries={t.education_history} />}
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
      <ProfileSections sections={t.profile_sections} />
      {!!t.demo && (
        <p className="demo-note">
          Hồ sơ và ảnh minh họa cho trải nghiệm sản phẩm.
        </p>
      )}
    </article>
  );
}

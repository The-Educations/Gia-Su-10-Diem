import { TrustLine } from "@/components/trust";
import { EducationTimeline } from "./tutor-education";
import { TimezoneTag } from "./tutor-timezone";
import { ProfileSections } from "./tutor-sections";
import { TutorAreaView } from "./tutor-area-view";
import { useEffect, useRef, type ReactNode } from "react";
import { Award, BadgeCheck, BookOpen, GraduationCap, MapPin, ScrollText, ShieldCheck, Star, UsersRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { embedUrl } from "@/lib/video";
import type { Tutor, Subject } from "@/lib/types";
import { Person, Section } from "@/components/common";
import { Badge } from "@/components/ui/badge";

export function TutorPresentation({
  tutor: t,
  subjects,
  preview = false,
  aside,
  children,
}: {
  tutor: Tutor;
  subjects: Subject[];
  preview?: boolean;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const { t: tr } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const Title = preview ? "h3" : "h1";
  const video = t.intro_video ? embedUrl(t.intro_video) : null, sample = t.sample_video ? embedUrl(t.sample_video) : null;
  const kind = { student: "Sinh viên", teacher: "Giáo viên", professional: "Người đi làm" }[t.tutor_kind as string];
  const rating = (t as { rating?: { average?: number | null; count?: number } }).rating;
  // Scroll reveal: sections fade+rise as they enter the viewport; CSS keeps
  // everything visible under prefers-reduced-motion.
  useEffect(() => {
    const root = ref.current;
    if (!root || !aside) return;
    const items = root.querySelectorAll(".tutor-body > *");
    items.forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [aside]);

  const stats = [
    { icon: GraduationCap, label: tr("Kinh nghiệm"), value: tr("{n} năm", { n: t.experience }) },
    rating?.average
      ? { icon: Star, label: tr("Đánh giá"), value: rating.average.toFixed(1), hint: tr("{n} lượt", { n: rating.count ?? 0 }) }
      : { icon: Star, label: tr("Đánh giá"), value: tr("Mới"), hint: tr("Chưa có lượt") },
    ...(typeof t.active_students === "number" ? [{ icon: UsersRound, label: tr("Học sinh đang học"), value: String(t.active_students) }] : []),
    ...(t.verified?.length ? [{ icon: BadgeCheck, label: tr("Minh chứng"), value: tr("{n} mục", { n: t.verified.length }) }] : []),
  ];

  const head = (
    <header className="tutor-hero-panel">
      <div className="tutor-cover" aria-hidden={!t.banner_url}>
        {t.banner_url && <img src={t.banner_url} alt={tr("Ảnh bìa của {name}", { name: t.name })} loading="lazy" decoding="async" />}
      </div>
      <div className="profile-hero hero-on-cover">
        <Person name={t.name} id={t.user_id} src={t.photo_url || undefined} large />
        <div className="tutor-hero-copy">
          <Title>{t.name}</Title>
          <p className="tutor-headline">{t.headline}</p>
          <div className="subject-tags">
            {kind && <Badge variant="outline">{tr(kind)}</Badge>}
            <TimezoneTag zone={t.timezone || "Asia/Ho_Chi_Minh"} />
            {t.mode && <Badge variant="outline">{t.mode === "online" ? tr("Trực tuyến") : t.mode === "offline" ? tr("Trực tiếp") : tr("Trực tuyến & trực tiếp")}</Badge>}
            {t.subjects.map((id) => <Badge variant="secondary" key={id}>{subjects.find((s) => s.id === id)?.name || id}</Badge>)}
            {!preview && (t.demo ? <Badge variant="outline">{tr("Hồ sơ minh họa")}</Badge> : <span className="approved-badge"><ShieldCheck aria-hidden="true" />{tr("Đã được quản trị duyệt")}</span>)}
          </div>
        </div>
      </div>
      <div className="profile-meta">
        <span><MapPin />{t.location}</span>
        {t.mode !== "online" && !!t.area_km && <span className="area-note">{tr("Dạy trực tiếp trong ~{km} km quanh {location}", { km: String(t.area_km), location: t.location })}</span>}
        {!preview && (rating?.average
          ? <a className="rating-link" href="#reviews"><Star aria-hidden="true" className="star-filled" />{rating.average.toFixed(1)} · {tr("{n} đánh giá", { n: rating.count ?? 0 })}</a>
          : <TrustLine trust={t.trust} />)}
      </div>
      {!preview && <div className="tutor-stats" aria-label={tr("Thông tin nhanh về gia sư")}>
        {stats.map(({ icon: Icon, label, value, hint }) => <div className="tutor-stat" key={label}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
          <strong>{value}</strong>
          {hint && <small>{hint}</small>}
        </div>)}
      </div>}
    </header>
  );

  const body = (
    <>
      {t.bio && <Section title={tr("Về gia sư")} icon={<BookOpen aria-hidden="true" />}><p className="reading-text">{t.bio}</p></Section>}
      {t.mode !== "online" && t.area_lat != null && t.area_lng != null && !!t.area_km && (
        <Section title={tr("Khu vực dạy trực tiếp")} icon={<MapPin aria-hidden="true" />}>
          <TutorAreaView lat={t.area_lat} lng={t.area_lng} km={t.area_km} exact={preview} />
        </Section>
      )}
      {(t.levels.length > 0 || t.goals.length > 0) && (
        <Section title={tr("Nhận dạy")} icon={<UsersRound aria-hidden="true" />}>
          <p>{t.levels.join(" · ")}</p>
          {t.goals.length > 0 && <p className="muted">{t.goals.join(" · ")}</p>}
        </Section>
      )}
      {(t.education || t.education_history?.length > 0) && (
        <Section title={tr("Học vấn")} icon={<GraduationCap aria-hidden="true" />}>
          {t.education && <p className="reading-text">{t.education}</p>}
          {!!t.education_history?.length && <EducationTimeline entries={t.education_history} />}
        </Section>
      )}
      {t.teaching_style && <Section title={tr("Phương pháp giảng dạy")} icon={<BookOpen aria-hidden="true" />}><p className="reading-text">{t.teaching_style}</p></Section>}
      {t.lesson_plan && <Section title={tr("Một buổi học cùng tôi")} icon={<ScrollText aria-hidden="true" />}><p className="reading-text">{t.lesson_plan}</p></Section>}
      {video && <Section title={tr("Video giới thiệu")}><div className="intro-video"><iframe src={video} title={tr("Video giới thiệu của {name}", { name: t.name })} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div></Section>}
      {sample && <Section title={tr("Một buổi học mẫu")}><div className="intro-video"><iframe src={sample} title={tr("Buổi học mẫu của {name}", { name: t.name })} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div></Section>}
      {!!t.verified?.length && (
        <Section title={tr("Đã xác minh")} icon={<BadgeCheck aria-hidden="true" />}>
          <ul className="verified-list">{t.verified.map((v, i) => {
            const Icon = v.kind === "school" ? GraduationCap : v.kind === "award" ? Award : ScrollText;
            return <li key={i}><Icon aria-hidden="true" /><span>{v.label}</span><BadgeCheck className="verified-mark" aria-label={tr("Đã đối chiếu minh chứng")} /></li>;
          })}</ul>
        </Section>
      )}
      <ProfileSections sections={t.profile_sections} />
      {!!t.demo && <p className="demo-note">{tr("Hồ sơ và ảnh minh họa cho trải nghiệm sản phẩm.")}</p>}
      {children}
    </>
  );

  return (
    <article ref={ref} className={`tutor-presentation${aside ? " tutor-split" : ""}`} data-theme={t.profile_theme || "paper"}>
      {head}
      {aside ? (
        <div className="tutor-content-grid">
          <div className="tutor-body">{body}</div>
          <div className="tutor-aside"><div className="tutor-aside-sticky">{aside}</div></div>
        </div>
      ) : body}
    </article>
  );
}

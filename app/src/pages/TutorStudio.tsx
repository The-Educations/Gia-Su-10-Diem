import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BadgeCheck,
  BookOpenCheck,
  Briefcase,
  CalendarClock,
  Check,
  CircleAlert,
  GraduationCap,
  House,
  Laptop,
  ListChecks,
  LoaderCircle,
  MonitorSmartphone,
  Search,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import "@/wizard.css";
import { api, fold, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Resource, Subject, Tutor, TutorKind, User } from "@/lib/types";
import { embedUrl } from "@/lib/video";
import { ErrorState, Heading, Loading, Page, State } from "@/components/common";
import { AddressFields } from "@/components/address-fields";
import { AreaMap } from "@/components/area-map";
import { AvailabilityGrid, scheduleBlocks, scheduleKeys } from "@/components/availability-grid";
import { CredentialsEditor, useCredentials } from "@/components/credentials-editor";
import { TimezoneField } from "@/components/tutor-timezone";
import { TutorUploads } from "@/components/tutor-uploads";
import { TutorInventory } from "@/components/tutor-inventory";
import { TutorGalleryEditor } from "@/components/tutor-gallery";
import { ProfileSectionsEditor } from "@/components/tutor-sections";
import { TutorPresentation } from "@/components/tutor-presentation";
import { TutorTrustPanel } from "@/components/tutor-trust-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";

const STEPS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "who", label: "Bạn là ai", icon: UserRound },
  { id: "subjects", label: "Môn & cấp dạy", icon: BookOpenCheck },
  { id: "mode", label: "Hình thức & học phí", icon: MonitorSmartphone },
  { id: "schedule", label: "Lịch rảnh", icon: CalendarClock },
  { id: "intro", label: "Giới thiệu", icon: Sparkles },
  { id: "proof", label: "Học vấn & minh chứng", icon: GraduationCap },
  { id: "review", label: "Xem lại & gửi duyệt", icon: ListChecks },
];
// The question each screen asks; the short label names the step in the progress bar.
const QUESTIONS: Record<string, string> = {
  who: "Bạn đang là ai?",
  subjects: "Bạn dạy môn nào?",
  mode: "Dạy ở đâu, học phí bao nhiêu?",
  schedule: "Khi nào bạn rảnh?",
  intro: "Giới thiệu đôi chút về bạn",
  proof: "Bạn học ở đâu?",
  review: "Học sinh sẽ thấy hồ sơ như thế này",
};
// Where the cursor goes when a step still needs something.
const MISSING_TARGET: Record<string, string> = {
  who: 'input[name="tutor_kind"]',
  subjects: ".subject-picker input, .levels-field input",
  mode: ":invalid, .address-trigger",
  schedule: ".availability-grid button:not([disabled])",
  intro: ":invalid",
  proof: ".credential-group button",
};
const KINDS: { value: Exclude<TutorKind, "">; label: string; icon: LucideIcon }[] = [
  { value: "student", label: "Sinh viên", icon: GraduationCap },
  { value: "teacher", label: "Giáo viên", icon: BookOpenCheck },
  { value: "professional", label: "Người đi làm", icon: Briefcase },
];
const MODES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "online", label: "Trực tuyến", icon: Laptop },
  { value: "offline", label: "Trực tiếp", icon: House },
  { value: "both", label: "Cả hai", icon: MonitorSmartphone },
];
const LEVELS = ["Tiểu học", "THCS", "THPT", "Người đi làm"];
const RATES = [120000, 150000, 200000, 250000, 300000];

function Chips({ legend, options, value, onChange }: {
  legend: string; options: { value: string; label: string }[]; value: string[]; onChange: (value: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <FieldSet>
      <FieldLegend>{t(legend)}</FieldLegend>
      <div className="chip-set">
        {options.map((o) => (
          <label key={o.value} className="chip" data-checked={value.includes(o.value) || undefined}>
            <input
              type="checkbox"
              className="cover-input"
              checked={value.includes(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
            />
            {value.includes(o.value) && <Check aria-hidden="true" />}
            {t(o.label)}
          </label>
        ))}
      </div>
    </FieldSet>
  );
}

function Cards<T extends string>({ legend, name, options, value, onChange, quiet = false }: {
  legend: string; name: string; options: { value: T; label: string; icon: LucideIcon }[]; value: T | ""; onChange: (v: T) => void; quiet?: boolean;
}) {
  const { t } = useI18n();
  return (
    <FieldSet>
      <FieldLegend className={quiet ? "sr-only" : undefined}>{t(legend)}</FieldLegend>
      <div className="choice-cards">
        {options.map(({ value: v, label, icon: Icon }) => (
          <label key={v} className="choice-card" data-checked={value === v || undefined}>
            <input type="radio" className="cover-input" name={name} value={v} checked={value === v} required onChange={() => onChange(v)} />
            <Icon aria-hidden="true" />
            <span>{t(label)}</span>
          </label>
        ))}
      </div>
    </FieldSet>
  );
}

function SubjectPicker({ subjects, value, onChange }: { subjects: Subject[]; value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useI18n(),
    [query, setQuery] = useState("");
  const shown = subjects.filter((s) => value.includes(s.id) || !query || fold(s.name).includes(fold(query)));
  return (
    <div className="subject-picker">
      <div className="search-input">
        <Search aria-hidden="true" />
        <Input aria-label={t("Tìm môn")} placeholder={t("Tìm môn…")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <Chips legend="Môn nhận dạy" options={shown.map((s) => ({ value: s.id, label: s.name }))} value={value} onChange={onChange} />
    </div>
  );
}

type Draft = Tutor;

function ProfileWizard({ tutor, subjects, goals, onPending }: { tutor: Tutor; subjects: Subject[]; goals: string[]; onPending: () => void }) {
  const { refresh, setUser } = useApp(),
    { t } = useI18n(),
    navigate = useNavigate(),
    reduce = useReducedMotion(),
    [params, setParams] = useSearchParams(),
    credentials = useCredentials();
  const [draft, setDraft] = useState<Draft>(tutor),
    [hours, setHours] = useState(() => scheduleKeys(tutor.weekly_schedule)),
    [scheduleRevision] = useState(tutor.weekly_schedule.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [direction, setDirection] = useState(1);
  const form = useRef<HTMLFormElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const index = Math.max(0, STEPS.findIndex((s) => s.id === params.get("step"))),
    step = STEPS[index];
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const schools = (credentials.data || []).filter((c) => c.kind === "school" && c.files.length && c.status !== "rejected");
  const video = draft.intro_video ? embedUrl(draft.intro_video) : null;

  const checks = useMemo(() => ({
    who: !!draft.tutor_kind,
    subjects: draft.subjects.length > 0 && draft.levels.length > 0,
    mode: !!draft.mode && draft.rate >= 50000 && (draft.mode === "online" || !!draft.ward_code),
    schedule: hours.size > 0,
    intro: draft.headline.trim().length > 0 && draft.bio.trim().length > 0,
    proof: schools.length > 0,
  }), [draft, hours, schools.length]);
  const missingSteps = STEPS.filter((s) => s.id in checks && !checks[s.id as keyof typeof checks]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    document.querySelector('.wizard-steps [aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index]);

  function go(next: number, focusMissing = false) {
    setError("");
    setDirection(next > index ? 1 : -1);
    setParams((p) => { const n = new URLSearchParams(p); n.set("step", STEPS[next].id); return n; }, { replace: true });
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    const id = STEPS[next].id;
    if (focusMissing && id in checks && !checks[id as keyof typeof checks]) {
      // After the step has slid in, put the cursor on the first thing it still needs.
      setTimeout(() => {
        const target = document.querySelector<HTMLElement>(`.wizard-panel :is(${MISSING_TARGET[id]})`);
        target?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        target?.focus({ preventScroll: true });
      }, reduce ? 60 : 320);
    }
  }
  function validate() {
    if (!form.current?.reportValidity()) return false;
    const missing: Record<string, string> = {
      who: "Chọn bạn là sinh viên, giáo viên hay người đi làm.",
      subjects: "Chọn ít nhất một môn và một cấp học.",
      mode: "Chọn khu vực dạy trực tiếp.",
      schedule: "Chọn ít nhất một giờ rảnh.",
      proof: "Thêm ít nhất một trường kèm minh chứng.",
    };
    if (step.id in missing && !checks[step.id as keyof typeof checks]) {
      setError(t(missing[step.id]));
      return false;
    }
    return true;
  }
  async function submit() {
    const firstMissing = (Object.keys(checks) as (keyof typeof checks)[]).find((k) => !checks[k]);
    if (firstMissing) {
      setError(t("Còn bước “{step}” chưa xong.", { step: t(STEPS.find((s) => s.id === firstMissing)!.label) }));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const education = schools[0] ? schools[0].label.slice(0, 200) : draft.education;
      const result = await api<{ user: User; review: { status: string; published: boolean } }>("/tutor/profile", "PUT", {
        ...draft,
        education,
        profile_theme: tutor.profile_theme,
        availability: { revision: scheduleRevision, blocks: scheduleBlocks(hours) },
      });
      setUser(result.user);
      refresh();
      toast.success(t(
        result.review.status === "approved" ? "Đã lưu. Thay đổi áp dụng ngay."
          : result.review.published ? "Đã gửi duyệt. Học sinh vẫn thấy bản đã duyệt trước đó."
            : "Hồ sơ đã gửi quản trị viên duyệt.",
      ));
      navigate("/workspace", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const body: Record<string, React.ReactNode> = {
    who: (
      <FieldGroup>
        <Cards quiet legend="Bạn đang là" name="tutor_kind" options={KINDS} value={draft.tutor_kind} onChange={(tutor_kind) => set({ tutor_kind })} />
        <Field className="narrow-field">
          <FieldLabel htmlFor="experience">{t("Số năm kinh nghiệm dạy")}</FieldLabel>
          <Input id="experience" type="number" min={0} max={60} required value={draft.experience} onChange={(e) => set({ experience: Number(e.target.value) })} />
        </Field>
      </FieldGroup>
    ),
    subjects: (
      <FieldGroup>
        <SubjectPicker subjects={subjects} value={draft.subjects} onChange={(v) => set({ subjects: v })} />
        <div className="levels-field"><Chips legend="Cấp học nhận dạy" options={LEVELS.map((v) => ({ value: v, label: v }))} value={draft.levels} onChange={(levels) => set({ levels })} /></div>
        {goals.length > 0 && <Chips legend="Mục tiêu kỳ thi nhận luyện" options={goals.map((v) => ({ value: v, label: v }))} value={draft.goals} onChange={(g) => set({ goals: g })} />}
      </FieldGroup>
    ),
    mode: (
      <FieldGroup>
        <Cards legend="Hình thức dạy" name="mode" options={MODES} value={draft.mode} onChange={(mode) => set({ mode })} />
        <div>
          <AddressFields value={draft} required={draft.mode !== "online"} onChange={(address, location) => set({ ...address, location: location || draft.location })} />
          <p className="field-hint">{t(draft.mode === "online" ? "Không bắt buộc với dạy trực tuyến." : "Khu vực bạn nhận dạy tại nhà. Học sinh chỉ thấy phường và tỉnh.")}</p>
        </div>
        {draft.mode !== "online" && (
          <Field>
            <FieldLabel>{t("Khu vực dạy trực tiếp")}</FieldLabel>
            <AreaMap value={{ area_lat: draft.area_lat, area_lng: draft.area_lng, area_km: draft.area_km }} onChange={(area) => set(area)} />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="rate">{t("Học phí (VND / buổi)")}</FieldLabel>
          <Input id="rate" type="number" min={50000} max={3000000} step={1000} required value={draft.rate} onChange={(e) => set({ rate: Number(e.target.value) })} />
          <div className="chip-set compact" role="group" aria-label={t("Mức học phí gợi ý")}>
            {RATES.map((r) => (
              <button type="button" key={r} className="chip" data-checked={draft.rate === r || undefined} onClick={() => set({ rate: r })}>{money(r)}</button>
            ))}
          </div>
        </Field>
        <label className="trial-toggle">
          <input type="checkbox" checked={!!draft.accepts_trial} onChange={(e) => set({ accepts_trial: e.target.checked })} />
          <span><strong>{t("Nhận học thử miễn phí")}</strong><small>{t("Học sinh mới được học thử 1 buổi 60 phút trước khi gửi gói.")}</small></span>
        </label>
      </FieldGroup>
    ),
    schedule: (
      <FieldGroup>
        <TimezoneField value={draft.timezone} onChange={(timezone) => set({ timezone })} />
        <div className="availability-toolbar">
          <span>{t("Lịch hằng tuần · Giờ Việt Nam")}</span>
          <span aria-live="polite">{t("{count} giờ / tuần", { count: hours.size })}</span>
        </div>
        <AvailabilityGrid selected={hours} setSelected={setHours} busy={busy} />
      </FieldGroup>
    ),
    intro: (
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="headline">{t("Tiêu đề hồ sơ")}</FieldLabel>
          <Input id="headline" required maxLength={120} value={draft.headline} onChange={(e) => set({ headline: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bio">{t("Giới thiệu & phương pháp dạy")}</FieldLabel>
          <Textarea id="bio" required maxLength={2000} rows={5} value={draft.bio} onChange={(e) => set({ bio: e.target.value })} />
        </Field>
        <section className="wizard-optional" aria-label={t("Không bắt buộc")}>
        <h3>{t("Thêm cho hồ sơ nổi bật (không bắt buộc)")}</h3>
        <Field>
          <FieldLabel htmlFor="teaching_style">{t("Phương pháp giảng dạy")}</FieldLabel>
          <Textarea id="teaching_style" maxLength={1500} rows={4} value={draft.teaching_style} onChange={(e) => set({ teaching_style: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="lesson_plan">{t("Một buổi học cùng tôi")}</FieldLabel>
          <Textarea id="lesson_plan" maxLength={1500} rows={4} value={draft.lesson_plan} onChange={(e) => set({ lesson_plan: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="intro_video">{t("Video giới thiệu (YouTube hoặc Google Drive)")}</FieldLabel>
          <Input id="intro_video" type="url" inputMode="url" maxLength={300} placeholder="https://youtu.be/…" value={draft.intro_video}
            onChange={(e) => { e.target.setCustomValidity(e.target.value && !embedUrl(e.target.value) ? t("Dùng liên kết YouTube hoặc Google Drive.") : ""); set({ intro_video: e.target.value }); }} />
        </Field>
        <Field>
          <FieldLabel htmlFor="sample_video">{t("Video một buổi học mẫu (không bắt buộc)")}</FieldLabel>
          <Input id="sample_video" type="url" inputMode="url" maxLength={300} placeholder="https://youtu.be/…" value={draft.sample_video || ""}
            onChange={(e) => { e.target.setCustomValidity(e.target.value && !embedUrl(e.target.value) ? t("Dùng liên kết YouTube hoặc Google Drive.") : ""); set({ sample_video: e.target.value }); }} />
        </Field>
        <ProfileSectionsEditor value={draft.profile_sections} onChange={(profile_sections) => set({ profile_sections })} />
        </section>
      </FieldGroup>
    ),
    proof: null,
    review: (
      <div className="wizard-review">
        {missingSteps.length > 0 && (
          <ul className="review-checklist">
            {missingSteps.map((s) => (
              <li key={s.id}>
                <CircleAlert aria-hidden="true" />
                <span>{t(s.label)}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => go(STEPS.indexOf(s), true)}>{t("Hoàn thành")}</Button>
              </li>
            ))}
          </ul>
        )}
        <div role="region" aria-label={t("Xem trước hồ sơ")}>
          <TutorPresentation preview subjects={subjects}
            tutor={{ ...draft, photo_url: tutor.photo_url, banner_url: tutor.banner_url, profile_theme: tutor.profile_theme, intro_video: video ? draft.intro_video : "",
              verified: (credentials.data || []).filter((c) => c.status === "approved" && c.files.length).map((c) => ({ kind: c.kind, label: c.label })) }} />
        </div>
      </div>
    ),
  };

  // Blocks with their own forms (uploads, gallery, credentials) sit outside the
  // step form; nested forms would submit the page.
  const before: Record<string, React.ReactNode> = {
    intro: <TutorUploads t={tutor} onPending={onPending} />,
    proof: <CredentialsEditor tutorKind={draft.tutor_kind} result={credentials} />,
  };
  const after: Record<string, React.ReactNode> = {
    intro: (
      <>
        <TutorGalleryEditor images={tutor.gallery || []} onPending={onPending} />
        <TutorInventory tutor={tutor} />
      </>
    ),
  };
  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: 28 * direction },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -28 * direction },
      };
  return (
    <div className="wizard" data-step={step.id}>
      <div className="wizard-top">
        <div className="wizard-top-row">
          <span>{t("Bước {n}/{total}", { n: index + 1, total: STEPS.length })} · {t(step.label)}</span>
          {missingSteps.length ? (
            <button type="button" className="wizard-missing" onClick={() => go(STEPS.indexOf(missingSteps[0]), true)}>
              <CircleAlert aria-hidden="true" />{t("Còn {n} mục chưa xong", { n: missingSteps.length })}
            </button>
          ) : <span className="wizard-missing" data-done><BadgeCheck aria-hidden="true" />{t("Đã đủ thông tin")}</span>}
        </div>
        <nav className="wizard-steps" aria-label={t("Các bước tạo hồ sơ")}>
          <ol>
            {STEPS.map((s, i) => {
              const done = checks[s.id as keyof typeof checks];
              return (
                <li key={s.id}>
                  <button type="button" aria-current={i === index ? "step" : undefined} data-done={done || undefined} title={t(s.label)}
                    aria-label={`${t(s.label)}${s.id in checks ? (done ? ` · ${t("xong")}` : ` · ${t("còn thiếu")}`) : ""}`} onClick={() => go(i, true)} />
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
      <div className="wizard-main">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step.id}
            className="wizard-panel"
            transition={{ duration: reduce ? 0.12 : 0.24, ease: [0.16, 1, 0.3, 1] }}
            {...motionProps}
          >
            <header className="wizard-heading">
              <h2 ref={heading} tabIndex={-1}>{t(QUESTIONS[step.id])}</h2>
            </header>
            {before[step.id] && <div className="wizard-block">{before[step.id]}</div>}
            <form
              id="wizard-form"
              ref={form}
              onSubmit={(e) => { e.preventDefault(); if (step.id === "review") void submit(); else if (validate()) go(index + 1); }}
            >
              <fieldset disabled={busy} className="profile-fields">{body[step.id]}</fieldset>
            </form>
            {after[step.id] && <div className="wizard-block">{after[step.id]}</div>}
            {error && <ErrorState error={error} />}
            <div className="wizard-actions">
              {index > 0 && <Button type="button" variant="ghost" disabled={busy} onClick={() => go(index - 1)}>{t("Quay lại")}</Button>}
              <Button type="submit" form="wizard-form" disabled={busy}>
                {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                {t(step.id === "review" ? "Lưu & gửi duyệt" : "Tiếp tục")}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function TutorStudio() {
  const { t } = useI18n(),
    [params] = useSearchParams(),
    [uploadPending, setUploadPending] = useState(false),
    ratings = params.get("tab") === "ratings";
  const profile = useLoad<Tutor>("/tutor/profile"),
    subjects = useLoad<Subject[]>("/subjects"),
    exams = useLoad<Resource[]>("/resources");
  if (params.get("tab") === "slots") return <Navigate to="/calendar" replace />;
  if (profile.loading || subjects.loading || exams.loading) return <Loading />;
  if (profile.error || subjects.error || exams.error || !profile.data)
    return <ErrorState error={profile.error || subjects.error || exams.error} retry={() => { profile.reload(); subjects.reload(); exams.reload(); }} />;
  const tutor = profile.data,
    pending = uploadPending || tutor.status === "pending";
  return (
    <Page>
      <Heading
        title={t("Hồ sơ gia sư")}
        action={
          <div className="actions">
            <State value={pending ? "pending_profile" : tutor.status} />
            {(tutor.status === "approved" || !!tutor.published) && !uploadPending && (
              <Button variant="outline" asChild>
                <Link to={`/tutors/${tutor.user_id}`}>{t("Xem hồ sơ công khai")}</Link>
              </Button>
            )}
          </div>
        }
      />
      {tutor.status === "rejected" && <p className="studio-note" role="status">{t("Quản trị viên cần bạn bổ sung hồ sơ. Kiểm tra email và thông báo, chỉnh sửa rồi gửi lại.")}</p>}
      <nav className="segmented" aria-label={t("Mục hồ sơ gia sư")}>
        <Link to="/studio" aria-current={!ratings ? "page" : undefined}>{t("Hồ sơ")}</Link>
        <Link to="/studio?tab=ratings" aria-current={ratings ? "page" : undefined}>{t("Đánh giá & điểm")}</Link>
      </nav>
      {ratings ? <TutorTrustPanel /> : <ProfileWizard tutor={tutor} subjects={subjects.data || []} goals={[...new Set(exams.data?.map((r) => r.category))]} onPending={() => setUploadPending(true)} />}
    </Page>
  );
}

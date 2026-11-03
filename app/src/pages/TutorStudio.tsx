import { TutorInventory } from "@/components/tutor-inventory";
import { ProfileSectionsEditor } from "@/components/tutor-sections";
import { EducationEditor } from "@/components/tutor-education";
import { TimezoneField } from "@/components/tutor-timezone";
import { TutorGallery, TutorGalleryEditor } from "@/components/tutor-gallery";
import { TutorPresentation } from "@/components/tutor-presentation";
import { TutorUploads } from "@/components/tutor-uploads";
import { AddressFields } from "@/components/address-fields";
import {
  AvailabilityGrid,
  scheduleKeys,
  scheduleBlocks,
} from "@/components/availability-grid";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, useApp, useLoad, money } from "@/lib/api";
import type { Tutor, Subject, Resource, User } from "@/lib/types";
import {
  Page,
  Heading,
  Choose,
  Submit,
  State,
  Loading,
  ErrorState,
} from "@/components/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";

const steps = ["Thông tin cá nhân", "Học vấn & thành tích", "Lịch dạy"];
function ProfileForm({
  t,
  subjects,
  goals,
  onPending,
}: {
  t: Tutor;
  subjects: Subject[];
  goals: string[];
  onPending: () => void;
}) {
  const { refresh, setUser } = useApp(),
    navigate = useNavigate();
  const [draft, setDraft] = useState(t),
    [step, setStep] = useState(0);
  const [selectedHours, setSelectedHours] = useState(() =>
    scheduleKeys(t.weekly_schedule),
  );
  const [scheduleRevision] = useState(t.weekly_schedule.revision);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  function next() {
    if (!form.current?.reportValidity()) return;
    if (step === 0 && !draft.subjects.length) {
      setError("Chọn ít nhất một môn nhận dạy.");
      return;
    }
    setError("");
    setStep((s) => Math.min(2, s + 1));
  }
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step < 2) {
      next();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/tutor/profile", "PUT", {
        ...draft,
        // Asset/theme uploads save independently; never overwrite their latest values.
        profile_theme: t.profile_theme,
        availability: {
          revision: scheduleRevision,
          blocks: scheduleBlocks(selectedHours),
        },
      });
      setUser(result.user);
      refresh();
      toast.success("Hồ sơ đã gửi quản trị viên duyệt.");
      navigate("/workspace", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function options(
    label: string,
    key: "subjects" | "levels" | "goals",
    values: { value: string; label: string }[],
  ) {
    return (
      <FieldSet>
        <FieldLegend>{label}</FieldLegend>
        <div className="subject-checkboxes">
          {values.map((v) => (
            <label key={v.value}>
              <input
                type="checkbox"
                checked={draft[key].includes(v.value)}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [key]: e.target.checked
                      ? [...d[key], v.value]
                      : d[key].filter((x) => x !== v.value),
                  }))
                }
              />
              {v.label}
            </label>
          ))}
        </div>
      </FieldSet>
    );
  }
  return (
    <>
      <ol className="profile-steps" aria-label="Các bước tạo hồ sơ">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="studio-profile-layout" data-calendar={step === 2}>
        <div className="studio-editor">
          <h2 ref={heading} tabIndex={-1}>
            {steps[step]}
          </h2>
          <div hidden={step !== 0}>
            <TutorUploads t={t} onPending={onPending} />
            <TutorInventory tutor={t} />
          </div>
          <div hidden={step !== 1}>
            <TutorGalleryEditor
              images={t.gallery || []}
              onPending={onPending}
            />
          </div>
          <form
            ref={form}
            onSubmit={save}
            onChange={(e) => {
              const input = e.target;
              if (
                (input instanceof HTMLInputElement ||
                  input instanceof HTMLTextAreaElement) &&
                input.name
              )
                setDraft((d) => ({
                  ...d,
                  [input.name]:
                    input.type === "number" ? Number(input.value) : input.value,
                }));
            }}
          >
            <fieldset
              disabled={busy || step !== 0}
              hidden={step !== 0}
              className="profile-fields"
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="headline">Tiêu đề hồ sơ</FieldLabel>
                  <Input
                    id="headline"
                    name="headline"
                    defaultValue={t.headline}
                    required
                    maxLength={120}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bio">
                    Giới thiệu & phương pháp dạy
                  </FieldLabel>
                  <Textarea
                    id="bio"
                    name="bio"
                    defaultValue={t.bio}
                    required
                    maxLength={2000}
                  />
                </Field>
                <AddressFields
                  value={draft}
                  onChange={(address, location) =>
                    setDraft((d) => ({ ...d, ...address, location }))
                  }
                />
                {!draft.province_code && t.location && (
                  <p className="muted">Địa chỉ hiện tại: {t.location}</p>
                )}
                <div className="form-two">
                  <Choose
                    label="Hình thức dạy"
                    value={draft.mode}
                    onChange={(mode) => setDraft((d) => ({ ...d, mode }))}
                    options={[
                      { value: "online", label: "Trực tuyến" },
                      { value: "offline", label: "Trực tiếp" },
                      { value: "both", label: "Cả hai" },
                    ]}
                  />
                  <Field>
                    <FieldLabel htmlFor="rate">Học phí (VND / buổi)</FieldLabel>
                    <Input
                      id="rate"
                      name="rate"
                      type="number"
                      min={50000}
                      max={3000000}
                      step={1000}
                      defaultValue={t.rate}
                      required
                    />
                  </Field>
                </div>
                {options(
                  "Môn nhận dạy",
                  "subjects",
                  subjects.map((s) => ({ value: s.id, label: s.name })),
                )}
                {options(
                  "Cấp học nhận dạy",
                  "levels",
                  ["Tiểu học", "THCS", "THPT", "Người đi làm"].map((v) => ({
                    value: v,
                    label: v,
                  })),
                )}
                {options(
                  "Mục tiêu kỳ thi nhận luyện",
                  "goals",
                  goals.map((v) => ({ value: v, label: v })),
                )}
              </FieldGroup>
            </fieldset>
            <fieldset
              disabled={busy || step !== 1}
              hidden={step !== 1}
              className="profile-fields"
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="education">
                    Học vấn / Chuyên môn
                  </FieldLabel>
                  <Input
                    id="education"
                    name="education"
                    defaultValue={t.education}
                    required
                    maxLength={200}
                  />
                </Field>
                <EducationEditor
                  value={draft.education_history}
                  onChange={(education_history) =>
                    setDraft((d) => ({ ...d, education_history }))
                  }
                />
                <Field>
                  <FieldLabel htmlFor="experience">
                    Số năm kinh nghiệm
                  </FieldLabel>
                  <Input
                    id="experience"
                    name="experience"
                    type="number"
                    min={0}
                    max={60}
                    defaultValue={t.experience}
                    required
                  />
                </Field>
                <ProfileSectionsEditor
                  value={draft.profile_sections}
                  onChange={(profile_sections) =>
                    setDraft((d) => ({ ...d, profile_sections }))
                  }
                />
                <Field>
                  <FieldLabel htmlFor="teaching_style">
                    Phương pháp giảng dạy
                  </FieldLabel>
                  <Textarea
                    id="teaching_style"
                    name="teaching_style"
                    defaultValue={t.teaching_style}
                    maxLength={1500}
                    rows={4}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="lesson_plan">
                    Một buổi học cùng tôi
                  </FieldLabel>
                  <Textarea
                    id="lesson_plan"
                    name="lesson_plan"
                    defaultValue={t.lesson_plan}
                    maxLength={1500}
                    rows={4}
                  />
                </Field>
              </FieldGroup>
            </fieldset>
            <fieldset
              disabled={busy || step !== 2}
              hidden={step !== 2}
              className="profile-fields"
            >
              <FieldGroup>
                <TimezoneField
                  value={draft.timezone}
                  onChange={(timezone) => setDraft((d) => ({ ...d, timezone }))}
                />
                <div className="availability-toolbar">
                  <span>Lịch hằng tuần · Giờ Việt Nam</span>
                  <span aria-live="polite">
                    {selectedHours.size} giờ / tuần
                  </span>
                </div>
                <AvailabilityGrid
                  selected={selectedHours}
                  setSelected={setSelectedHours}
                  busy={busy}
                />
              </FieldGroup>
            </fieldset>
            {error && <ErrorState error={error} />}
            <div className="actions profile-step-actions">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setStep((s) => s - 1);
                  }}
                >
                  Quay lại
                </Button>
              )}
              <Submit busy={busy}>
                {step === 2 ? "Lưu & gửi duyệt" : "Tiếp tục"}
              </Submit>
            </div>
          </form>
        </div>
        <aside className="studio-preview" aria-label="Xem trước hồ sơ">
          <div className="studio-preview-heading">
            <h2>Xem trước hồ sơ</h2>
            <span>{money(draft.rate)} / buổi</span>
          </div>
          <TutorPresentation
            preview
            subjects={subjects}
            tutor={{
              ...draft,
              photo_url: t.photo_url,
              banner_url: t.banner_url,
              profile_theme: t.profile_theme,
            }}
          />
          <TutorGallery images={t.gallery || []} name={t.name} />
        </aside>
      </div>
    </>
  );
}
export default function TutorStudio() {
  const [params] = useSearchParams();
  const [uploadPending, setUploadPending] = useState(false);
  const profile = useLoad<Tutor>("/tutor/profile"),
    subjects = useLoad<Subject[]>("/subjects"),
    exams = useLoad<Resource[]>("/resources");
  if (params.get("tab") === "slots") return <Navigate to="/calendar" replace />;
  if (profile.loading || subjects.loading || exams.loading) return <Loading />;
  if (profile.error || subjects.error || exams.error || !profile.data)
    return (
      <ErrorState
        error={profile.error || subjects.error || exams.error}
        retry={() => {
          profile.reload();
          subjects.reload();
          exams.reload();
        }}
      />
    );
  const t = profile.data;
  return (
    <Page>
      <Heading
        title="Hồ sơ gia sư"
        action={
          <div className="actions">
            <State
              value={
                uploadPending || t.status === "pending"
                  ? "pending_profile"
                  : t.status
              }
            />
            {t.status === "approved" && !uploadPending && (
              <Button variant="outline" asChild>
                <Link to={`/tutors/${t.user_id}`}>Xem hồ sơ công khai</Link>
              </Button>
            )}
          </div>
        }
      />
      <Alert>
        <AlertDescription>
          {!uploadPending && t.status === "approved"
            ? "Chỉnh sửa hồ sơ sẽ cần được duyệt lại."
            : t.status === "rejected"
              ? "Kiểm tra email, cập nhật hồ sơ rồi gửi duyệt lại."
              : "Hoàn thiện hồ sơ và gửi duyệt để xuất hiện trong tìm kiếm."}
        </AlertDescription>
      </Alert>
      <ProfileForm
        t={t}
        subjects={subjects.data || []}
        goals={[...new Set(exams.data?.map((r) => r.category))]}
        onPending={() => setUploadPending(true)}
      />
    </Page>
  );
}

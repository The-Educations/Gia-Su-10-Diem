import { TutorGallery, TutorGalleryEditor } from "@/components/tutor-gallery";
import { TutorPresentation } from "@/components/tutor-presentation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TutorUploads } from "@/components/tutor-uploads";
import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { Plus, Trash2, Camera, UserRound, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad, dateTime, money } from "@/lib/api";
import type { Tutor, Subject, Resource } from "@/lib/types";
import {
  Page,
  Heading,
  Choose,
  Submit,
  State,
  Loading,
  ErrorState,
  Section,
  Blank,
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
function ProfileForm({
  t,
  subjects,
  goals,
}: {
  t: Tutor;
  subjects: Subject[];
  goals: string[];
}) {
  const { refresh } = useApp(),
    [draft, setDraft] = useState(t),
    [mode, setMode] = useState(t.mode),
    [selected, setSelected] = useState(t.subjects),
    [levels, setLevels] = useState(t.levels),
    [examGoals, setExamGoals] = useState(t.goals),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      await api("/tutor/profile", "PUT", {
        ...d,
        profile_theme: draft.profile_theme,
        mode,
        subjects: selected,
        levels,
        goals: examGoals,
        rate: Number(d.rate),
        experience: Number(d.experience),
      });
      refresh();
      toast.success("Hồ sơ đã gửi quản trị viên duyệt.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="studio-profile-layout">
      <div className="studio-editor">
        <form
          onSubmit={save}
          onChange={(e) => {
            const input = e.target;
            if (
              (input instanceof HTMLInputElement ||
                input instanceof HTMLTextAreaElement) &&
              input.name
            )
              setDraft((previous) => ({
                ...previous,
                [input.name]:
                  input.type === "number" ? Number(input.value) : input.value,
              }));
          }}
        >
          <fieldset disabled={busy} className="profile-fields">
            <FieldGroup>
              <FieldSet>
                <FieldLegend>Phong cách hồ sơ</FieldLegend>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={draft.profile_theme}
                  onValueChange={(value) => {
                    if (value)
                      setDraft((previous) => ({
                        ...previous,
                        profile_theme: value as Tutor["profile_theme"],
                      }));
                  }}
                  aria-label="Phong cách hồ sơ"
                >
                  <ToggleGroupItem value="paper">Giấy ấm</ToggleGroupItem>
                  <ToggleGroupItem value="sage">Xanh lá</ToggleGroupItem>
                  <ToggleGroupItem value="ink">Mực đỏ</ToggleGroupItem>
                </ToggleGroup>
              </FieldSet>
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
              <div className="form-two">
                <Field>
                  <FieldLabel htmlFor="location">Tỉnh / Thành phố</FieldLabel>
                  <Input
                    id="location"
                    name="location"
                    defaultValue={t.location}
                    required
                    maxLength={100}
                  />
                </Field>
                <Choose
                  label="Hình thức dạy"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "online", label: "Trực tuyến" },
                    { value: "offline", label: "Trực tiếp" },
                    { value: "both", label: "Cả hai" },
                  ]}
                />
                <Field>
                  <FieldLabel htmlFor="rate">Học phí (VND / giờ)</FieldLabel>
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
              </div>
              <FieldSet>
                <FieldLegend>Môn nhận dạy</FieldLegend>
                <div className="subject-checkboxes">
                  {subjects.map((s) => (
                    <label key={s.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, s.id]
                              : selected.filter((id) => id !== s.id),
                          )
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </FieldSet>
              <FieldSet>
                <FieldLegend>Cấp học nhận dạy</FieldLegend>
                <div className="subject-checkboxes">
                  {["Tiểu học", "THCS", "THPT", "Người đi làm"].map((v) => (
                    <label key={v}>
                      <input
                        type="checkbox"
                        checked={levels.includes(v)}
                        onChange={(e) =>
                          setLevels(
                            e.target.checked
                              ? [...levels, v]
                              : levels.filter((l) => l !== v),
                          )
                        }
                      />
                      {v}
                    </label>
                  ))}
                </div>
              </FieldSet>
              <FieldSet>
                <FieldLegend>Mục tiêu kỳ thi nhận luyện</FieldLegend>
                <div className="subject-checkboxes">
                  {goals.map((v) => (
                    <label key={v}>
                      <input
                        type="checkbox"
                        checked={examGoals.includes(v)}
                        onChange={(e) =>
                          setExamGoals(
                            e.target.checked
                              ? [...examGoals, v]
                              : examGoals.filter((g) => g !== v),
                          )
                        }
                      />
                      {v}
                    </label>
                  ))}
                </div>
              </FieldSet>
              {error && <ErrorState error={error} />}
              <Submit busy={busy}>Lưu & gửi duyệt</Submit>
            </FieldGroup>
          </fieldset>
        </form>
      </div>
      <aside className="studio-preview" aria-label="Xem trước hồ sơ">
        <div className="studio-preview-heading">
          <h2>Xem trước hồ sơ</h2>
          <span>{money(draft.rate)} / giờ</span>
        </div>
        <TutorPresentation
          preview
          subjects={subjects}
          tutor={{
            ...draft,
            photo_url: t.photo_url,
            subjects: selected,
            levels,
            goals: examGoals,
            mode,
          }}
        />
        <TutorGallery images={t.gallery || []} name={t.name} />
      </aside>
    </div>
  );
}
export default function TutorStudio() {
  const [params, setParams] = useSearchParams();
  const tab = ["files", "profile", "slots"].includes(params.get("tab") || "")
    ? params.get("tab")!
    : "files";
  const [uploadPending, setUploadPending] = useState(false);
  const { refresh } = useApp(),
    profile = useLoad<Tutor>("/tutor/profile"),
    subjects = useLoad<Subject[]>("/subjects"),
    exams = useLoad<Resource[]>("/resources"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function add(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      value = String(new FormData(form).get("starts_at"));
    setBusy(true);
    setError("");
    try {
      await api("/tutor/slots", "POST", {
        starts_at: new Date(`${value}:00+07:00`).toISOString(),
      });
      refresh();
      form.reset();
      toast.success("Đã thêm giờ trống");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    setBusy(true);
    try {
      await api(`/tutor/slots/${id}`, "DELETE");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (profile.loading) return <Loading />;
  if (profile.error || !profile.data)
    return <ErrorState error={profile.error} />;
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
            ? "Hồ sơ đang hiển thị trong tìm kiếm. Chỉnh sửa hồ sơ sẽ cần được duyệt lại."
            : t.moderation_note ||
              "Hoàn thiện hồ sơ và gửi duyệt để xuất hiện trong tìm kiếm."}
        </AlertDescription>
      </Alert>
      <Tabs
        value={tab}
        onValueChange={(value) => setParams({ tab: value }, { replace: true })}
        className="studio-workspace"
      >
        <TabsList className="studio-tabs">
          <TabsTrigger value="files">
            <Camera size={16} />
            Ảnh & CV
          </TabsTrigger>
          <TabsTrigger value="profile">
            <UserRound size={16} />
            Hồ sơ nhận dạy
          </TabsTrigger>
          <TabsTrigger value="slots">
            <CalendarDays size={16} />
            Giờ trống
          </TabsTrigger>
        </TabsList>
        <TabsContent value="files" forceMount>
          <section id="studio-files" className="studio-files">
            <TutorUploads
              t={t}
              onPending={() => {
                setUploadPending(true);
              }}
            />
            <TutorGalleryEditor images={t.gallery || []} onPending={() => setUploadPending(true)} />
          </section>
        </TabsContent>
        <TabsContent value="profile" forceMount>
          <ProfileForm
            t={t}
            subjects={subjects.data || []}
            goals={[...new Set(exams.data?.map((r) => r.category))]}
          />
        </TabsContent>
        <TabsContent value="slots" forceMount>
          <div className="studio-availability" id="studio-slots">
            <Section title="Giờ trống · 60 phút / buổi">
              <form className="slot-form" onSubmit={add}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="starts_at">
                      Giờ bắt đầu (giờ Việt Nam)
                    </FieldLabel>
                    <Input
                      id="starts_at"
                      name="starts_at"
                      type="datetime-local"
                      step={3600}
                      required
                    />
                  </Field>
                  <Submit busy={busy}>
                    <Plus data-icon="inline-start" />
                    Thêm giờ trống
                  </Submit>
                </FieldGroup>
              </form>
              {error && <ErrorState error={error} />}
              <div className="slot-list">
                {!t.slots.length ? (
                  <Blank title="Chưa có giờ trống" />
                ) : (
                  t.slots.map((s) => (
                    <div key={s.id}>
                      <span>{dateTime(s.starts_at)}</span>
                      {s.reserved ? (
                        <span className="state">Đã được đặt</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          aria-label={`Xóa giờ ${dateTime(s.starts_at)}`}
                          onClick={() => remove(s.id)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Section>
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  );
}

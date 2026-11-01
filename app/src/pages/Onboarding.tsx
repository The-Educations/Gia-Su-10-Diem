import { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { BookOpen, GraduationCap, Check, ArrowRight } from "lucide-react";
import { api, useApp, useLoad, accountDestination, money } from "@/lib/api";
import type { User, Tutor, Subject } from "@/lib/types";
import { Page, Loading, ErrorState, Submit, Choose } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Progress } from "@/components/ui/progress";

export default function Onboarding() {
  const { user, setUser, refresh } = useApp();
  const [params] = useSearchParams();
  const [step, setStep] = useState(user!.onboarding_step);
  const [role, setRole] = useState(user!.role);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const tutor = useLoad<Tutor>(user!.role === "tutor" ? "/tutor/profile" : null);
  const subjects = useLoad<Subject[]>(user!.role === "tutor" ? "/subjects" : null);
  useEffect(() => { heading.current?.focus(); }, [step, tutor.loading, subjects.loading]);
  if (user!.role === "admin" || user!.onboarding_step === 3)
    return <Navigate to={accountDestination(user!, params.get("next"))} replace />;
  if (tutor.loading || subjects.loading) return <Loading />;
  if (tutor.error || subjects.error) return <ErrorState error={tutor.error || subjects.error} retry={() => { tutor.reload(); subjects.reload(); }} />;

  async function save(values: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/account/onboarding", "PUT", { step, ...values });
      setUser(result.user);
      setStep(result.user.onboarding_step);
      refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const isTutor = user!.role === "tutor";
  const titles = ["Bạn muốn bắt đầu thế nào?", isTutor ? "Tạo hồ sơ gia sư" : "Bạn muốn học điều gì?", "Sẵn sàng bắt đầu"];
  return <Page>
    <div className="setup-layout">
      <aside className="setup-steps" aria-label="Tiến trình thiết lập">
        <span className="brand-mark">10<span>đ</span></span>
        <h2>Thiết lập tài khoản</h2>
        <ol>{["Chọn vai trò", "Hoàn thiện hồ sơ", "Bắt đầu sử dụng"].map((label, i) =>
          <li key={label} aria-current={step === i ? "step" : undefined} data-complete={step > i}>
            <span>{step > i ? <Check size={16} aria-hidden="true" /> : i + 1}</span>{label}
          </li>)}</ol>
        <Progress value={step / 3 * 100} aria-label="Tiến trình thiết lập" />
      </aside>
      <section className="setup-content" aria-busy={busy}>
        <h1 ref={heading} tabIndex={-1}>{titles[step]}</h1>
        {error && <ErrorState error={error} />}
        {step === 0 && <form onSubmit={(e) => { e.preventDefault(); void save({ role }); }}>
          <FieldGroup>
            <ToggleGroup type="single" orientation="vertical" spacing={2} variant="outline" value={role} onValueChange={(v) => { if (v) setRole(v as User["role"]); }} className="setup-roles" aria-label="Vai trò của bạn">
              <ToggleGroupItem value="student"><BookOpen aria-hidden="true" />Học sinh / Phụ huynh</ToggleGroupItem>
              <ToggleGroupItem value="tutor"><GraduationCap aria-hidden="true" />Gia sư</ToggleGroupItem>
            </ToggleGroup>
            <p>{role === "tutor" ? "Tạo hồ sơ giảng dạy, mở lịch trống và nhận yêu cầu học." : "Đặt mục tiêu học tập, tìm gia sư và chọn lịch học phù hợp."}</p>
            <Submit busy={busy}>Tiếp tục<ArrowRight data-icon="inline-end" /></Submit>
          </FieldGroup>
        </form>}
        {step === 1 && <ProfileForm key={user!.role} user={user!} tutor={tutor.data} subjects={subjects.data || []} busy={busy} save={save} />}
        {step === 2 && <div className="setup-review">
          <dl>
            <div><dt>Họ và tên</dt><dd>{user!.name}</dd></div>
            <div><dt>Vai trò</dt><dd>{isTutor ? "Gia sư" : "Học sinh / Phụ huynh"}</dd></div>
            {isTutor ? <><div><dt>Môn dạy</dt><dd>{subjects.data?.filter((s) => tutor.data?.subjects.includes(s.id)).map((s) => s.name).join(", ")}</dd></div><div><dt>Học phí / giờ</dt><dd>{money(tutor.data!.rate)}</dd></div></> : <div><dt>Mục tiêu học tập</dt><dd>{user!.goal}</dd></div>}
          </dl>
          <h2>{isTutor ? "Tiếp theo: chuẩn bị buổi dạy đầu tiên" : "Tiếp theo: tìm buổi học đầu tiên"}</h2>
          <ol className="setup-guide">{(isTutor ? [
            "Hồ sơ đang chờ duyệt. Gia sư chỉ xuất hiện trong tìm kiếm sau khi được duyệt.",
            "Trong Hồ sơ gia sư, thêm ảnh, CV và mở khung giờ bạn có thể dạy.",
            "Vào Lịch dạy & yêu cầu để xác nhận buổi học và trao đổi với học sinh.",
          ] : [
            "Vào Tìm gia sư, chọn môn học và học phí phù hợp.",
            "Mở hồ sơ gia sư để trao đổi hoặc chọn một giờ trống và gửi yêu cầu học.",
            "Theo dõi xác nhận trong Lịch học và trao đổi tại Tin nhắn.",
          ]).map((text) => <li key={text}>{text}</li>)}</ol>
          <div className="setup-actions">
            <Button variant="outline" disabled={busy} onClick={() => { setError(""); setStep(1); }}>Sửa hồ sơ</Button>
            <Button disabled={busy} onClick={() => void save({})}>{busy ? "Đang lưu…" : "Hoàn tất thiết lập"}<ArrowRight data-icon="inline-end" /></Button>
          </div>
        </div>}
      </section>
    </div>
  </Page>;
}

function ProfileForm({ user, tutor, subjects, busy, save }: { user: User; tutor: Tutor | null; subjects: Subject[]; busy: boolean; save: (values: Record<string, unknown>) => Promise<void> }) {
  const [mode, setMode] = useState(tutor?.mode || "online");
  const [selected, setSelected] = useState(tutor?.subjects || []);
  const isTutor = user.role === "tutor";
  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    void save(isTutor ? { ...d, mode, subjects: selected, rate: Number(d.rate), experience: Number(d.experience) } : d);
  }
  return <form onSubmit={submit}>
    <FieldGroup>
      <Field><FieldLabel htmlFor="setup-name">Họ và tên</FieldLabel><Input id="setup-name" name="name" defaultValue={user.name} autoComplete="name" required maxLength={80} /></Field>
      {!isTutor ? <Field><FieldLabel htmlFor="setup-goal">Mục tiêu học tập</FieldLabel><Textarea id="setup-goal" name="goal" defaultValue={user.goal} placeholder="Ví dụ: Củng cố Toán lớp 9, chuẩn bị thi vào lớp 10." required maxLength={1000} /></Field> : <>
        <Field><FieldLabel htmlFor="setup-headline">Tiêu đề hồ sơ</FieldLabel><Input id="setup-headline" name="headline" defaultValue={tutor?.headline} placeholder="Gia sư Toán THCS — học chắc kiến thức nền" required maxLength={120} /></Field>
        <Field><FieldLabel htmlFor="setup-bio">Giới thiệu cách bạn dạy</FieldLabel><Textarea id="setup-bio" name="bio" defaultValue={tutor?.bio} required maxLength={2000} /></Field>
        <Field><FieldLabel htmlFor="setup-education">Học vấn / Chuyên môn</FieldLabel><Input id="setup-education" name="education" defaultValue={tutor?.education} required maxLength={200} /></Field>
        <fieldset className="setup-subjects"><legend>Môn dạy</legend><div>{subjects.map((s) => <label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, s.id] : selected.filter((id) => id !== s.id))} />{s.name}</label>)}</div></fieldset>
        <div className="setup-pair">
          <Field><FieldLabel htmlFor="setup-rate">Học phí / giờ (VNĐ)</FieldLabel><Input id="setup-rate" name="rate" type="number" min={50000} max={3000000} step={1} defaultValue={tutor?.rate || 150000} required /></Field>
          <Field><FieldLabel htmlFor="setup-experience">Số năm kinh nghiệm</FieldLabel><Input id="setup-experience" name="experience" type="number" min={0} max={60} step={1} defaultValue={tutor?.experience || 0} required /></Field>
        </div>
        <Choose label="Hình thức dạy" value={mode} onChange={setMode} options={[{ value: "online", label: "Trực tuyến" }, { value: "offline", label: "Trực tiếp" }, { value: "both", label: "Cả hai" }]} />
        <Field><FieldLabel htmlFor="setup-location">Khu vực dạy</FieldLabel><Input id="setup-location" name="location" defaultValue={tutor?.location || "Trực tuyến"} required maxLength={100} /></Field>
      </>}
      {isTutor && !selected.length && <p role="status">Chọn ít nhất một môn bạn có thể dạy.</p>}
      <Submit busy={busy} disabled={isTutor && !selected.length}>Lưu và tiếp tục<ArrowRight data-icon="inline-end" /></Submit>
    </FieldGroup>
  </form>;
}

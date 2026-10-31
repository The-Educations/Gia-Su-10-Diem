import { TutorPresentation } from "@/components/tutor-presentation";
import { ContactTutor } from "@/components/contact-tutor";
import { FileText, Download } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, Check } from "lucide-react";
import { toast } from "sonner";
import { useApp, useLoad, api, money, dateTime } from "@/lib/api";
import type { Tutor, Subject } from "@/lib/types";
import {
  Page,
  Choose,
  Loading,
  ErrorState,
  Submit,
  Blank,
  Section,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
export default function TutorDetail() {
  const { id } = useParams(),
    { user, refresh } = useApp(),
    navigate = useNavigate(),
    result = useLoad<Tutor>(`/tutors/${id}`),
    subjects = useLoad<Subject[]>("/subjects");
  const [slot, setSlot] = useState(""),
    [subject, setSubject] = useState(""),
    [mode, setMode] = useState("online"),
    [note, setNote] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (result.loading) return <Loading />;
  if (result.error || !result.data)
    return <ErrorState error={result.error} retry={result.reload} />;
  const t = result.data,
    chosen = t.slots.find((s) => String(s.id) === slot),
    selectedSubject = subject || t.subjects[0];
  async function book() {
    if (!t || !chosen) return;
    setBusy(true);
    setError("");
    try {
      await api("/bookings", "POST", {
        slot_id: chosen.id,
        subject_id: selectedSubject,
        mode: t.mode === "both" ? mode : t.mode,
        note,
      });
      refresh();
      toast.success("Đã gửi yêu cầu. Gia sư sẽ xác nhận trong lịch học.");
      navigate("/bookings");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page>
      <Link className="back-link" to="/tutors">
        <ArrowLeft size={16} />
        Tìm gia sư
      </Link>
      <div className="profile-layout">
        <div>
          <TutorPresentation tutor={t} subjects={subjects.data || []}>
            <div className="profile-actions">
              <ContactTutor tutor={t} />
              {t.cv && (
                <Button variant="outline" asChild>
                  <a href={t.cv.url}>
                    <FileText data-icon="inline-start" />
                    Tải CV
                    <Download data-icon="inline-end" />
                  </a>
                </Button>
              )}
            </div>
            <a className="mobile-book-link text-link" href="#booking-panel">
              Chọn giờ học · {money(t.rate)} / giờ
            </a>
          </TutorPresentation>
          <Section title={`Đánh giá (${t.reviews.length})`}>
            {t.reviews.length ? (
              t.reviews.map((r, i) => (
                <article className="review" key={i}>
                  <strong>{r.name}</strong>
                  <span>{r.rating}/5</span>
                  <p>{r.body}</p>
                </article>
              ))
            ) : (
              <p className="muted">
                Chưa có đánh giá từ buổi học đã hoàn thành.
              </p>
            )}
          </Section>
        </div>
        <aside className="booking-panel" id="booking-panel">
          <div className="booking-price">
            {money(t.rate)}
            <small> / 60 phút</small>
          </div>
          <h2>
            <CalendarDays size={19} />
            Chọn buổi học
          </h2>
          {t.slots.length ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!user) {
                  navigate(`/auth?next=/tutors/${id}`);
                  return;
                }
                if (user.role !== "student") {
                  toast.info("Đặt buổi học bằng tài khoản học sinh.");
                  return;
                }
                setConfirm(true);
              }}
            >
              <FieldGroup>
                <Choose
                  label="Môn học"
                  value={selectedSubject}
                  onChange={setSubject}
                  options={t.subjects.map((s) => ({
                    value: s,
                    label: subjects.data?.find((x) => x.id === s)?.name || s,
                  }))}
                />
                <Choose
                  label="Giờ học (Việt Nam)"
                  value={slot}
                  onChange={setSlot}
                  allLabel="Chọn khung giờ"
                  options={t.slots.map((s) => ({
                    value: String(s.id),
                    label: dateTime(s.starts_at),
                  }))}
                />
                {t.mode === "both" && (
                  <Choose
                    label="Hình thức"
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: "online", label: "Trực tuyến" },
                      { value: "offline", label: "Trực tiếp" },
                    ]}
                  />
                )}
                <Field>
                  <FieldLabel htmlFor="goal">Bạn muốn học gì?</FieldLabel>
                  <Textarea
                    id="goal"
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ví dụ: ôn phương trình bậc hai…"
                  />
                </Field>
                <Button type="submit" disabled={!slot}>
                  Xem lại yêu cầu
                  <Check data-icon="inline-end" />
                </Button>
              </FieldGroup>
            </form>
          ) : (
            <Blank
              title="Chưa có giờ trống"
              description="Gia sư chưa mở lịch mới."
            />
          )}
          <p className="booking-policy">
            Chưa thu phí trên website. Hai bên thống nhất địa điểm và thanh toán
            sau khi xác nhận.
          </p>
        </aside>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận yêu cầu học</DialogTitle>
            <DialogDescription>
              Buổi học sẽ ở trạng thái chờ gia sư xác nhận.
            </DialogDescription>
          </DialogHeader>
          <dl className="summary-list">
            <div>
              <dt>Gia sư</dt>
              <dd>{t.name}</dd>
            </div>
            <div>
              <dt>Thời gian</dt>
              <dd>{chosen && dateTime(chosen.starts_at)}</dd>
            </div>
            <div>
              <dt>Học phí / 60 phút</dt>
              <dd>{money(t.rate)}</dd>
            </div>
            <div>
              <dt>Hình thức</dt>
              <dd>
                {(t.mode === "both" ? mode : t.mode) === "online"
                  ? "Trực tuyến"
                  : "Trực tiếp"}
              </dd>
            </div>
          </dl>
          {error && <ErrorState error={error} />}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              book();
            }}
          >
            <Submit busy={busy}>Gửi yêu cầu học</Submit>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, Send, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";
import "@/money.css";
import "@/wizard.css";
import { api, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Proposal, Subject, Tutor, Wallet } from "@/lib/types";
import { celebrate } from "@/lib/celebrate";
import { ErrorState, Submit } from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const TIMES = Array.from({ length: 33 }, (_, i) => ({ hour: 6 + Math.floor(i / 2), minute: (i % 2) * 30 }));
const pad = (n: number) => String(n).padStart(2, "0");
export const timeLabel = (s: { hour: number; minute: number }) => `${pad(s.hour)}:${pad(s.minute)}`;
const tomorrow = () => new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);

// The student's side of an offer: the package, its weekly rhythm and the total
// that will be held from the balance until the tutor answers.
export function ProposalComposer({ tutor, subjects }: { tutor: Tutor; subjects: Subject[] }) {
  const { user } = useApp(),
    { t } = useI18n(),
    navigate = useNavigate(),
    [open, setOpen] = useState(false),
    wallet = useLoad<Wallet>(open && user?.role === "student" ? "/wallet" : null),
    [subject, setSubject] = useState(tutor.subjects[0] || ""),
    [mode, setMode] = useState<"online" | "offline">(tutor.mode === "offline" ? "offline" : "online"),
    [sessions, setSessions] = useState(8),
    [minutes, setMinutes] = useState(90),
    [rate, setRate] = useState(tutor.rate),
    [days, setDays] = useState<number[]>([1, 3]),
    [time, setTime] = useState("19:00"),
    [start, setStart] = useState(tomorrow),
    [message, setMessage] = useState(""),
    [trial, setTrial] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  // The tutor's weekly free hours, earliest first in each day, as quick picks.
  const free = (tutor.weekly_blocks || []).filter((b, i, a) => !a.some((x) => x.weekday === b.weekday && x.hour === b.hour - 1)).slice(0, 8);
  const total = trial ? 0 : sessions * rate,
    available = wallet.data?.available ?? 0,
    short = Math.max(0, total - available);
  if (user && user.role !== "student") return null;
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!days.length) return setError(t("Chọn ít nhất một ngày trong tuần."));
    setBusy(true);
    setError("");
    try {
      const [hour, minute] = time.split(":").map(Number);
      const p = await api<Proposal>("/proposals", "POST", {
        tutor_id: tutor.user_id, subject_id: subject, mode, start_date: start, message, trial,
        ...(trial ? { sessions: 1, minutes: 60, rate: 0 } : { sessions, minutes, rate }),
        schedule: days.map((weekday) => ({ weekday, hour, minute })),
      });
      celebrate(e.currentTarget as HTMLElement);
      toast.success(t("Đã gửi offer. Số tiền được tạm giữ đến khi gia sư trả lời."));
      setOpen(false);
      navigate(`/proposals?id=${p.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button className="proposal-cta" onClick={() => (user ? setOpen(true) : navigate(`/auth?next=/tutors/${tutor.user_id}`))}>
        <Send data-icon="inline-start" />{t("Gửi offer")}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="proposal-dialog" closeDisabled={busy}>
          <DialogHeader>
            <DialogTitle>{t("Gửi offer cho {name}", { name: tutor.name })}</DialogTitle>
            <DialogDescription>{t("Tổng gói được tạm giữ từ số dư. Gia sư từ chối hoặc không trả lời trong 48 giờ thì tiền tự hoàn lại.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={send}>
            <FieldGroup>
              <div className="form-two">
                <Field>
                  <FieldLabel htmlFor="p-subject">{t("Môn học")}</FieldLabel>
                  <select id="p-subject" className="native-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
                    {tutor.subjects.map((id) => <option key={id} value={id}>{subjects.find((s) => s.id === id)?.name || id}</option>)}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="p-mode">{t("Hình thức")}</FieldLabel>
                  <select id="p-mode" className="native-select" value={mode} onChange={(e) => setMode(e.target.value as "online" | "offline")}>
                    {tutor.mode !== "offline" && <option value="online">{t("Trực tuyến")}</option>}
                    {tutor.mode !== "online" && <option value="offline">{t("Trực tiếp")}</option>}
                  </select>
                </Field>
              </div>
              {!!tutor.accepts_trial && (
                <label className="trial-toggle">
                  <input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} />
                  <span><strong>{t("Học thử miễn phí 1 buổi 60 phút")}</strong></span>
                </label>
              )}
              {!trial && <div className="proposal-package">
                <Field>
                  <FieldLabel htmlFor="p-sessions">{t("Số buổi")}</FieldLabel>
                  <div className="stepper">
                    <Button type="button" variant="outline" size="icon" aria-label={t("Bớt một buổi")} onClick={() => setSessions((n) => Math.max(1, n - 1))}><Minus /></Button>
                    <Input id="p-sessions" type="number" min={1} max={60} value={sessions} onChange={(e) => setSessions(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
                    <Button type="button" variant="outline" size="icon" aria-label={t("Thêm một buổi")} onClick={() => setSessions((n) => Math.min(60, n + 1))}><Plus /></Button>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="p-minutes">{t("Mỗi buổi")}</FieldLabel>
                  <select id="p-minutes" className="native-select" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                    {[60, 90, 120].map((m) => <option key={m} value={m}>{t("{n} phút", { n: m })}</option>)}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="p-rate">{t("Học phí / buổi")}</FieldLabel>
                  <Input id="p-rate" type="number" min={50000} max={3000000} step={1000} value={rate} onChange={(e) => setRate(Number(e.target.value))} required />
                </Field>
              </div>}
              <FieldSet>
                <FieldLegend>{t("Lịch hằng tuần")}</FieldLegend>
                <div className="chip-set">
                  {WEEKDAYS.map((d, i) => (
                    <button type="button" key={d} className="chip" aria-pressed={days.includes(i)} data-checked={days.includes(i) || undefined}
                      onClick={() => setDays((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i].sort()))}>{t(d)}</button>
                  ))}
                </div>
              </FieldSet>
              {free.length > 0 && (
                <div className="free-hours" role="group" aria-label={t("Giờ gia sư rảnh")}>
                  <span>{t("Giờ gia sư rảnh")}</span>
                  {free.map((b) => {
                    const label = `${t(WEEKDAYS[b.weekday])} ${timeLabel({ hour: b.hour, minute: 0 })}`;
                    const on = days.includes(b.weekday) && time === timeLabel({ hour: b.hour, minute: 0 });
                    return <button type="button" key={`${b.weekday}-${b.hour}`} className="chip" data-checked={on || undefined}
                      onClick={() => { setTime(timeLabel({ hour: b.hour, minute: 0 })); setDays((v) => (v.includes(b.weekday) ? v : [...v, b.weekday].sort())); }}>{label}</button>;
                  })}
                </div>
              )}
              <div className="form-two">
                <Field>
                  <FieldLabel htmlFor="p-time">{t("Giờ bắt đầu")}</FieldLabel>
                  <select id="p-time" className="native-select" value={time} onChange={(e) => setTime(e.target.value)}>
                    {TIMES.map((s) => <option key={timeLabel(s)}>{timeLabel(s)}</option>)}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="p-start">{t("Ngày bắt đầu")}</FieldLabel>
                  <Input id="p-start" type="date" min={tomorrow()} value={start} onChange={(e) => setStart(e.target.value)} required />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="p-message">{t("Lời nhắn")}</FieldLabel>
                <Textarea id="p-message" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("Mục tiêu, trình độ hiện tại, điều bạn mong muốn…")} />
              </Field>
            </FieldGroup>
            <div className="proposal-summary" aria-live="polite">
              <div><span>{t("{sessions} buổi × {rate}", { sessions, rate: money(rate) })}</span><strong>{money(total)}</strong></div>
              {wallet.data && (
                <div className={short ? "short" : ""}>
                  <span><WalletIcon aria-hidden="true" />{t("Số dư hiện có")} {money(available)}</span>
                  {short > 0 && <Link to="/wallet">{t("Nạp thêm {amount}", { amount: money(short) })}</Link>}
                </div>
              )}
            </div>
            {error && <ErrorState error={error} />}
            <div className="actions dialog-actions">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("Hủy")}</Button>
              <Submit busy={busy} disabled={short > 0}>{trial ? t("Gửi yêu cầu học thử") : t("Gửi offer {amount}", { amount: money(total) })}</Submit>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

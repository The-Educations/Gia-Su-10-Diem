import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, CheckCheck, ClipboardList, Megaphone, MessageCircle, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ClassAssignment, ClassInfo, ClassMember, ClassSession } from "@/lib/types";
import { dayOf, timeOf } from "@/components/session-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

const when = (iso: string) => `${dayOf(iso)} · ${timeOf(iso)}`;
const dueState = (due?: string | null) => !due ? "" : Date.parse(due) < Date.now() ? "overdue" : Date.parse(due) - Date.now() < 48 * 3600000 ? "soon" : "";

export function nextCountdown(iso: string | null | undefined, t: (s: string, v?: Record<string, string | number>) => string) {
  if (!iso) return "";
  const diff = Date.parse(iso) - Date.now(), day = 86400000;
  if (diff < 0) return t("Đang diễn ra hoặc đã qua");
  if (diff < day) return t("Hôm nay {time}", { time: timeOf(iso) });
  if (diff < 2 * day) return t("Ngày mai {time}", { time: timeOf(iso) });
  return t("Còn {n} ngày", { n: Math.ceil(diff / day) });
}

export function ClassStats({ c, tutor, me }: { c: ClassInfo; tutor: boolean; me?: ClassMember }) {
  const { t } = useI18n();
  const active = c.members.filter((m) => m.status === "active");
  const cards = tutor ? [
    [String(c.tutor_stats?.upcoming_7d || 0), t("buổi trong 7 ngày")],
    [money(c.tutor_stats?.gross_confirmed || 0), t("học phí đã xác nhận")],
    [money(c.tutor_stats?.gross_settled || 0), t("đã đối chiếu")],
    [String(active.length), t("học sinh đang học")],
  ] : [
    [String(me?.done || 0), t("buổi đã học")],
    [t("{n} giờ", { n: me?.hours_done || 0 }), t("thời lượng đã học")],
    [`${me?.completion_rate || 0}%`, t("hoàn thành gói")],
    [money(me?.paid_total || 0), t("học phí đã tính")],
  ];
  return <div className="class-stats-strip">{cards.map(([v, label]) => <div key={label}><strong>{v}</strong><span>{label}</span></div>)}</div>;
}

export function ClassPosts({ c, tutor, onChanged }: { c: ClassInfo; tutor: boolean; onChanged: () => void }) {
  const { t } = useI18n(), [body, setBody] = useState(""), [busy, setBusy] = useState(false);
  async function post(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api(`/classes/${c.id}/posts`, "POST", { body }); setBody(""); toast.success(t("Đã đăng thông báo")); onChanged(); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="class-section class-posts"><header><h2><Megaphone aria-hidden="true" />{t("Thông báo lớp")}</h2></header>
    {tutor && <form className="class-post-composer" onSubmit={post}><Textarea rows={2} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("Thông báo cho cả lớp…")} required minLength={2} /><Button type="submit" disabled={busy}><Send data-icon="inline-start" />{t("Đăng")}</Button></form>}
    {(c.posts || []).length ? <ol className="class-post-list">{c.posts!.map((p) => <li key={p.id}><strong>{p.author_name}</strong><time>{when(p.created_at)}</time><p>{p.body}</p></li>)}</ol> : <p className="credential-empty">{t("Chưa có thông báo nào.")}</p>}
  </section>;
}

export function Assignments({ c, tutor, me, onChanged }: { c: ClassInfo; tutor: boolean; me?: ClassMember; onChanged: () => void }) {
  const { t } = useI18n(), [adding, setAdding] = useState(false), [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true);
    try {
      await api(`/classes/${c.id}/assignments`, "POST", { title: f.get("title"), note: f.get("note"), due_at: f.get("due_at") || "", session_id: f.get("session_id") ? Number(f.get("session_id")) : null });
      toast.success(t("Đã giao bài tập")); setAdding(false); onChanged();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="class-section assignments-panel"><header><h2><ClipboardList aria-hidden="true" />{t("Bài tập")}</h2>{tutor && <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>{t(adding ? "Đóng" : "Giao bài tập")}</Button>}</header>
    {tutor && adding && <form className="assignment-form" onSubmit={add}><FieldGroup>
      <Field><FieldLabel htmlFor="a-title">{t("Tiêu đề")}</FieldLabel><Input id="a-title" name="title" required minLength={2} maxLength={160} /></Field>
      <Field><FieldLabel htmlFor="a-note">{t("Mô tả hoặc liên kết")}</FieldLabel><Textarea id="a-note" name="note" rows={3} maxLength={2000} /></Field>
      <Field><FieldLabel htmlFor="a-due">{t("Hạn nộp")}</FieldLabel><Input id="a-due" name="due_at" type="datetime-local" /></Field>
      <Field><FieldLabel htmlFor="a-session">{t("Gắn với buổi")}</FieldLabel><select id="a-session" name="session_id" className="native-select"><option value="">{t("Không gắn buổi")}</option>{(c.sessions || []).filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i).map((s) => <option key={s.id} value={s.id}>{when(s.starts_at)}</option>)}</select></Field>
      <div className="actions dialog-actions"><Button type="button" variant="ghost" onClick={() => setAdding(false)}>{t("Hủy")}</Button><Button type="submit" disabled={busy}>{t("Giao bài tập")}</Button></div>
    </FieldGroup></form>}
    {(c.assignments || []).length ? <div className="assignment-list">{c.assignments!.map((a) => <AssignmentCard key={a.id} a={a} c={c} tutor={tutor} me={me} onChanged={onChanged} />)}</div> : <p className="credential-empty">{t(tutor ? "Chưa có bài tập. Giao bài đầu tiên để lớp theo dõi." : "Gia sư chưa giao bài tập.")}</p>}
  </section>;
}

function AssignmentCard({ a, c, tutor, me, onChanged }: { a: ClassAssignment; c: ClassInfo; tutor: boolean; me?: ClassMember; onChanged: () => void }) {
  const { t } = useI18n(), [note, setNote] = useState(""), [feedback, setFeedback] = useState<Record<number, string>>({});
  const mine = a.submissions.find((s) => me && s.member_id === me.id), state = dueState(a.due_at);
  async function run(action: () => Promise<unknown>, ok: string) {
    try { await action(); toast.success(t(ok)); onChanged(); } catch (err) { toast.error((err as Error).message); }
  }
  return <article className="assignment-card" data-due={state || undefined}>
    <header><div><h3>{a.title}</h3><small>{a.due_at ? t("Hạn {when}", { when: when(a.due_at) }) : t("Không có hạn")}{a.session_starts_at ? ` · ${t("Buổi")} ${when(a.session_starts_at)}` : ""}</small></div>
      {tutor ? <span className="assignment-progress">{t("{done}/{total} đã nộp", { done: a.submitted, total: a.total })}</span> : mine && <span className="assignment-status" data-status={mine.status}>{t(({ pending: "Chưa nộp", submitted: "Đã nộp", reviewed: "Đã nhận xét" } as const)[mine.status])}</span>}
    </header>
    {a.note && <p className="assignment-note">{a.note}</p>}
    {state === "overdue" && mine?.status === "pending" && <p className="assignment-overdue">{t("Đã quá hạn nộp")}</p>}
    {!tutor && mine && mine.status !== "reviewed" && <form className="assignment-submit" onSubmit={(e) => { e.preventDefault(); void run(() => api(`/assignments/${a.id}/submit`, "POST", { note }), "Đã nộp bài"); }}>
      {mine.status === "pending" && <Textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Ghi chú hoặc liên kết bài làm…")} />}
      <Button type="submit" size="sm"><CheckCheck data-icon="inline-start" />{t(mine.status === "pending" ? "Nộp bài" : "Cập nhật bài nộp")}</Button>
    </form>}
    {!tutor && mine?.feedback && <p className="assignment-feedback"><strong>{t("Nhận xét của gia sư")}</strong> {mine.feedback}</p>}
    {tutor && <div className="assignment-submissions">{a.submissions.map((s) => <div key={s.member_id} className="assignment-submission" data-status={s.status}>
      <div><strong>{s.student_name}</strong><small>{s.status === "pending" ? t("Chưa nộp") : s.status === "submitted" ? t("Chờ nhận xét") : t("Đã nhận xét")}{s.note ? ` · ${s.note}` : ""}</small></div>
      {s.status === "submitted" && <span className="assignment-review"><Input value={feedback[s.member_id] || ""} onChange={(e) => setFeedback({ ...feedback, [s.member_id]: e.target.value })} placeholder={t("Nhận xét ngắn")} maxLength={1000} /><Button size="sm" variant="outline" onClick={() => run(() => api(`/assignments/${a.id}/review`, "POST", { member_id: s.member_id, feedback: feedback[s.member_id] || "" }), "Đã lưu nhận xét")}>{t("Nhận xét")}</Button></span>}
    </div>)}</div>}
    {tutor && <Button size="icon" variant="ghost" className="assignment-delete" aria-label={t("Xóa bài tập")} onClick={() => { if (confirm(t("Xóa bài tập này?"))) void run(() => api(`/classes/${c.id}/assignments/${a.id}`, "DELETE"), "Đã xóa bài tập"); }}><Trash2 /></Button>}
  </article>;
}

export function SessionNote({ s, tutor, onChanged }: { s: ClassSession; tutor: boolean; onChanged: () => void }) {
  const { t } = useI18n(), [editing, setEditing] = useState(false), [body, setBody] = useState(s.teacher_note || "");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await api(`/sessions/${s.id}/note`, "PUT", { body }); toast.success(t("Đã lưu ghi chú buổi học")); setEditing(false); onChanged(); }
    catch (err) { toast.error((err as Error).message); }
  }
  if (!s.teacher_note && !tutor) return null;
  return <div className="session-note"><details open={editing || undefined}><summary>{t("Ghi chú buổi học")}</summary>
    {s.teacher_note ? <p>{s.teacher_note}</p> : <p className="muted">{t("Chưa có ghi chú.")}</p>}
    {tutor && !editing && <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); setBody(s.teacher_note || ""); setEditing(true); }}>{t(s.teacher_note ? "Sửa ghi chú" : "Viết ghi chú")}</Button>}
    {tutor && editing && <form onSubmit={save}><Textarea rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} required /><span className="actions"><Button size="sm" type="submit">{t("Lưu ghi chú")}</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>{t("Hủy")}</Button></span></form>}
  </details></div>;
}

export function ClassMessages({ c, tutor }: { c: ClassInfo; tutor: boolean }) {
  const { t } = useI18n();
  return <section className="class-section class-messages"><header><h2><MessageCircle aria-hidden="true" />{t("Tin nhắn")}</h2></header>
    <p>{t("Trao đổi riêng với người trong lớp qua hội thoại hiện có. Tin nhắn nhóm chưa mở.")}</p>
    <div className="actions"><Button asChild><Link to="/messages"><MessageCircle data-icon="inline-start" />{t(tutor ? "Nhắn tin với học sinh" : "Nhắn tin với gia sư")}</Link></Button></div>
  </section>;
}

export function IcsLink({ id }: { id: number }) {
  const { t } = useI18n();
  return <Button asChild variant="outline" size="sm"><a href={`/api/classes/${id}/ics`} download><CalendarPlus data-icon="inline-start" />{t("Xuất lịch")}</a></Button>;
}

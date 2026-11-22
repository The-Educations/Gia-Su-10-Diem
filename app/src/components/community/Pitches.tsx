import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Send, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { api, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { celebrate } from "@/lib/celebrate";
import type { CommunityPostData } from "@/lib/types";
import { Person, Submit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import "@/money.css";

export const TOPICS = [
  ["find_tutor", "Tìm gia sư"],
  ["homework", "Hỏi bài"],
  ["experience", "Kinh nghiệm học & thi"],
  ["materials", "Chia sẻ tài liệu"],
  ["find_student", "Gia sư tìm lớp"],
  ["announcement", "Thông báo"],
] as const;
// A light guess used only to ask the author to double-check the topic.
export const looksLikeFindTutor = (text: string) => /(tìm|cần|kiếm|thuê)\s+(gia sư|thầy|cô|người dạy)/i.test(text);

type Extra = { topic?: string; likes?: number; interests?: number; liked?: boolean; interested?: boolean; pitch_count?: number };

export function PostReactions({ post }: { post: CommunityPostData & Extra }) {
  const { user } = useApp(), { t } = useI18n(), [state, setState] = useState(post);
  async function toggle(kind: "like" | "interest") {
    if (!user) return toast.error(t("Đăng nhập để tương tác."));
    const on = kind === "like" ? !state.liked : !state.interested;
    try { setState({ ...state, ...(await api<Extra>(`/community/posts/${post.id}/react`, "POST", { kind, on })) }); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="post-reactions">
      <button type="button" aria-pressed={!!state.liked} onClick={() => toggle("like")}><Heart aria-hidden="true" />{state.likes || 0}</button>
      {post.topic === "find_tutor" && <button type="button" aria-pressed={!!state.interested} onClick={() => toggle("interest")}><Star aria-hidden="true" />{t("Quan tâm")} · {state.interests || 0}</button>}
    </div>
  );
}

type PitchView = {
  count: number; closed: boolean;
  pitches?: { id: number; tutor_id: number; tutor_name: string; boost: number; featured: boolean; rank: number; sessions: number; minutes: number; rate: number; total: number; message: string; status: string }[];
  mine?: { rank: number; boost: number; featured: boolean; status: string } | null;
};

// "Tìm gia sư" posts collect tutors' offers instead of comments.
export function PitchPanel({ post }: { post: CommunityPostData }) {
  const { user } = useApp(), { t } = useI18n(), result = useLoad<PitchView>(`/community/posts/${post.id}/pitches`),
    subjects = useLoad<{ id: string; name: string }[]>(user?.role === "tutor" ? "/subjects" : null),
    [busy, setBusy] = useState(false), [open, setOpen] = useState(false);
  const v = result.data;
  if (!v) return null;
  const author = post.mine;
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(`/community/posts/${post.id}/pitches`, "POST", {
        subject_id: f.get("subject"), mode: f.get("mode"), sessions: Number(f.get("sessions")), minutes: Number(f.get("minutes")), rate: Number(f.get("rate")),
        schedule: [{ weekday: Number(f.get("weekday")), hour: Number(String(f.get("time")).split(":")[0]), minute: Number(String(f.get("time")).split(":")[1]) }],
        start_date: f.get("start"), message: f.get("message"), boost: Number(f.get("boost") || 0),
      });
      celebrate(e.currentTarget as HTMLElement);
      toast.success(t("Đã gửi hồ sơ"));
      setOpen(false);
      result.reload();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <section className="pitch-panel">
      <header>
        <h2>{t("Hồ sơ gia sư đã gửi")} <span>{v.count}</span></h2>
        {author && !v.closed && <Button variant="outline" size="sm" onClick={async () => { await api(`/community/posts/${post.id}/close`, "POST"); result.reload(); }}>{t("Đã tìm được gia sư")}</Button>}
      </header>
      {v.closed && <p className="credential-empty">{t("Người đăng đã tìm được gia sư.")}</p>}
      {v.pitches && (v.pitches.length ? (
        <ul className="pitch-list">
          {v.pitches.map((p) => (
            <li key={p.id} data-featured={p.featured || undefined}>
              <Person name={p.tutor_name} id={p.tutor_id} />
              <div>
                <strong>{p.tutor_name}{p.featured && <span className="pitch-featured"><Sparkles aria-hidden="true" />{t("Nổi bật")}</span>}</strong>
                <small>{t("{n} buổi × {rate}", { n: p.sessions, rate: money(p.rate) })} · {t("{n} phút", { n: p.minutes })}</small>
                {p.message && <p>{p.message}</p>}
              </div>
              <span className="actions">
                <Button size="sm" variant="ghost" asChild><Link to={`/tutors/${p.tutor_id}`}>{t("Xem hồ sơ")}</Link></Button>
                <Button size="sm" asChild><Link to={`/proposals?id=${p.id}`}>{t("Xem offer")}</Link></Button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="credential-empty">{t("Chưa có gia sư gửi hồ sơ.")}</p>)}
      {v.mine && <p className="pitch-mine">{t("Hồ sơ của bạn đang đứng thứ {rank}/{count}", { rank: v.mine.rank, count: v.count })}{v.mine.featured && ` · ${t("Nổi bật")}`}</p>}
      {user?.role === "tutor" && !v.mine && !v.closed && (open ? (
        <form className="pitch-form" onSubmit={send}>
          <FieldGroup>
            <div className="proposal-package">
              <Field><FieldLabel htmlFor="pt-subject">{t("Môn học")}</FieldLabel><select id="pt-subject" name="subject" className="native-select" required>{(subjects.data || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field><FieldLabel htmlFor="pt-mode">{t("Hình thức")}</FieldLabel><select id="pt-mode" name="mode" className="native-select"><option value="online">{t("Trực tuyến")}</option><option value="offline">{t("Trực tiếp")}</option></select></Field>
              <Field><FieldLabel htmlFor="pt-sessions">{t("Số buổi")}</FieldLabel><Input id="pt-sessions" name="sessions" type="number" min={1} max={60} defaultValue={8} required /></Field>
            </div>
            <div className="proposal-package">
              <Field><FieldLabel htmlFor="pt-minutes">{t("Mỗi buổi")}</FieldLabel><select id="pt-minutes" name="minutes" className="native-select" defaultValue="90"><option value="60">60</option><option value="90">90</option><option value="120">120</option></select></Field>
              <Field><FieldLabel htmlFor="pt-rate">{t("Học phí / buổi")}</FieldLabel><Input id="pt-rate" name="rate" type="number" min={50000} step={1000} defaultValue={180000} required /></Field>
              <Field><FieldLabel htmlFor="pt-start">{t("Ngày bắt đầu")}</FieldLabel><Input id="pt-start" name="start" type="date" required defaultValue={new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10)} /></Field>
            </div>
            <div className="form-two">
              <Field><FieldLabel htmlFor="pt-weekday">{t("Ngày trong tuần")}</FieldLabel><select id="pt-weekday" name="weekday" className="native-select">{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d, i) => <option key={d} value={i}>{t(d)}</option>)}</select></Field>
              <Field><FieldLabel htmlFor="pt-time">{t("Giờ bắt đầu")}</FieldLabel><Input id="pt-time" name="time" type="time" step={1800} defaultValue="19:00" required /></Field>
            </div>
            <Field><FieldLabel htmlFor="pt-message">{t("Lời nhắn")}</FieldLabel><Textarea id="pt-message" name="message" rows={3} maxLength={2000} required /></Field>
            <Field><FieldLabel htmlFor="pt-boost">{t("Đặt thêm credit để lên top 3 (không bắt buộc)")}</FieldLabel><Input id="pt-boost" name="boost" type="number" min={0} max={50} defaultValue={0} /></Field>
          </FieldGroup>
          <div className="actions dialog-actions"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("Hủy")}</Button><Submit busy={busy}><Send data-icon="inline-start" />{t("Gửi hồ sơ")}</Submit></div>
        </form>
      ) : (
        <Button onClick={() => setOpen(true)}><Send data-icon="inline-start" />{t("Gửi hồ sơ (2 credit)")}</Button>
      ))}
    </section>
  );
}

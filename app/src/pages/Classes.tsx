import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { BellRing, CalendarDays, ExternalLink, FileText, Link2, Plus, Trash2, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { api, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { celebrate } from "@/lib/celebrate";
import type { ClassInfo, ClassSession, User } from "@/lib/types";
import { Blank, ErrorState, Heading, Loading, Page, Person, Submit } from "@/components/common";
import { SessionActions, dayOf, timeOf } from "@/components/session-actions";
import { Assignments, ClassMessages, ClassPosts, ClassStats, IcsLink, SessionNote, nextCountdown } from "@/components/class-extras";
import { WEEKDAYS, timeLabel } from "@/components/proposal-composer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import "@/calendar.css";
import "@/money.css";

const rhythm = (c: ClassInfo, t: (s: string) => string) => c.schedule.map((s) => `${t(WEEKDAYS[s.weekday])} ${timeLabel(s)}`).join(" · ");
// A parent watches the children's package rows; the cards aggregate them without
// turning the parent into a class participant.
const watchedPackage = (c: ClassInfo, user: User | null | undefined) => {
  const own = c.members.find((m) => m.student_id === user?.id);
  if (own || user?.learner_type !== "parent" || !c.members.length) return own;
  const done = c.members.reduce((n, m) => n + m.done, 0), total = c.members.reduce((n, m) => n + m.sessions_total, 0);
  return {
    ...c.members[0], done, sessions_total: total,
    minutes_done: c.members.reduce((n, m) => n + (m.minutes_done || 0), 0),
    hours_done: c.members.reduce((n, m) => n + (m.hours_done || 0), 0),
    completion_rate: Math.min(100, Math.round((done / Math.max(1, total)) * 100)),
    paid_total: c.members.reduce((n, m) => n + (m.paid_total || 0), 0),
  };
};

export function ClassList() {
  const { user } = useApp(),
    { t } = useI18n(),
    result = useLoad<ClassInfo[]>("/classes");
  if (result.loading) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={result.reload} />;
  const rows = result.data || [];
  return (
    <Page>
      <Heading title={t("Lớp học")} action={<Button asChild variant="outline"><Link to="/schedule"><CalendarDays data-icon="inline-start" />{t("Lịch")}</Link></Button>} />
      {rows.length ? (
        <div className="class-grid">
          {rows.map((c) => {
            const me = watchedPackage(c, user);
            const total = me ? me.sessions_total : c.members.reduce((n, m) => n + (m.status === "active" ? 1 : 0), 0);
            return (
              <Link key={c.id} to={`/classes/${c.id}`} className="class-card" data-color={c.color} data-ended={c.members.every((m) => m.status !== "active") || undefined}>
                <span className="class-card-band" />
                <h2>{c.title}</h2>
                <p>{rhythm(c, t)} · {t("{n} phút", { n: c.minutes })}</p>
                {c.next_at ? <p className="class-next"><CalendarDays aria-hidden="true" /><strong>{nextCountdown(c.next_at, t)}</strong><span>{dayOf(c.next_at)} · {timeOf(c.next_at)}</span></p> : <p className="class-next muted">{t("Không còn buổi sắp tới")}</p>}
                {!!c.assignment_badge && <span className="class-card-badge">{t("{n} bài tập cần xử lý", { n: c.assignment_badge })}</span>}
                {me ? (
                  <div className="class-progress" aria-label={t("{done}/{total} buổi", { done: me.done, total })}>
                    <span style={{ width: `${Math.min(100, (me.done / Math.max(1, me.sessions_total)) * 100)}%` }} />
                    <small>{t("{done}/{total} buổi", { done: me.done, total: me.sessions_total })} · {c.tutor_name}</small>
                  </div>
                ) : (
                  <p className="class-members"><Users aria-hidden="true" />{t("{n} học sinh đang học", { n: total })}</p>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <Blank title={t(user?.role === "tutor" ? "Chưa có lớp. Nhận một đề nghị để mở lớp đầu tiên." : "Chưa có lớp. Gửi đề nghị cho gia sư để bắt đầu.")}
          action={<Button asChild><Link to={user?.role === "tutor" ? "/proposals" : "/tutors"}>{t(user?.role === "tutor" ? "Xem offer" : "Tìm gia sư")}</Link></Button>} />
      )}
      <LegacyHistory />
    </Page>
  );
}

// Read-only archive of the retired flows (one-off bookings, dated offers) —
// listed so old records stay visible; no actions.
function LegacyHistory() {
  const { t } = useI18n(),
    bookings = useLoad<{ id: number; starts_at: string; status: string; subject_name?: string; tutor_name?: string; student_name?: string }[]>("/bookings"),
    offers = useLoad<{ id: number; status: string; tutor_name?: string; student_name?: string }[]>("/offers");
  const rows = [
    ...(bookings.data || []).map((b) => ({ key: `b${b.id}`, when: b.starts_at, label: `${b.subject_name || "Booking"} · ${b.tutor_name || b.student_name || ""}`, status: b.status })),
    ...(offers.data || []).map((o) => ({ key: `o${o.id}`, when: "", label: `${o.tutor_name || o.student_name || ""}`, status: o.status })),
  ];
  if (!rows.length) return null;
  return (
    <section className="legacy-history">
      <h2 className="muted">{t("Lịch sử cũ")}</h2>
      <ul className="list">{rows.map((r) => <li key={r.key} className="muted"><span>{r.when ? `${dayOf(r.when)} · ${timeOf(r.when)}` : "—"} · {r.label} · {r.status}</span></li>)}</ul>
    </section>
  );
}

function Materials({ c, tutor, onChanged }: { c: ClassInfo; tutor: boolean; onChanged: () => void }) {
  const { t } = useI18n(), [busy, setBusy] = useState(false), [adding, setAdding] = useState(false);
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(`/classes/${c.id}/materials`, "POST", { title: f.get("title"), url: f.get("url"), note: f.get("note"), session_id: f.get("session_id") ? Number(f.get("session_id")) : null });
      toast.success(t("Đã thêm bài giảng"));
      setAdding(false);
      onChanged();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }
  const icon = (url: string) => (/youtu/.test(url) ? <Video aria-hidden="true" /> : /drive\.google/.test(url) ? <FileText aria-hidden="true" /> : <Link2 aria-hidden="true" />);
  return (
    <section className="class-section">
      <header><h2>{t("Bài giảng")}</h2>{tutor && !adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus data-icon="inline-start" />{t("Thêm bài giảng")}</Button>}</header>
      {adding && (
        <form className="material-form" onSubmit={add}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="m-title">{t("Tiêu đề")}</FieldLabel><Input id="m-title" name="title" required minLength={2} maxLength={160} /></Field>
            <Field><FieldLabel htmlFor="m-url">{t("Liên kết YouTube, Google Drive hoặc trang web")}</FieldLabel><Input id="m-url" name="url" type="url" placeholder="https://" /></Field>
            <Field><FieldLabel htmlFor="m-session">{t("Gắn với buổi")}</FieldLabel>
              <select id="m-session" name="session_id" className="native-select"><option value="">{t("Cả lớp")}</option>{(c.sessions || []).filter((s) => s.status !== "cancelled").filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i).map((s) => <option key={s.id} value={s.id}>{dayOf(s.starts_at)} {timeOf(s.starts_at)}</option>)}</select>
            </Field>
            <Field><FieldLabel htmlFor="m-note">{t("Ghi chú")}</FieldLabel><Textarea id="m-note" name="note" rows={3} maxLength={2000} /></Field>
          </FieldGroup>
          <div className="actions dialog-actions"><Button type="button" variant="ghost" onClick={() => setAdding(false)}>{t("Hủy")}</Button><Submit busy={busy}>{t("Lưu bài giảng")}</Submit></div>
        </form>
      )}
      {(c.materials || []).length ? (
        <ul className="material-list">
          {c.materials!.map((m) => (
            <li key={m.id}>
              <span className="material-icon">{icon(m.url)}</span>
              <div>
                <strong>{m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer">{m.title}<ExternalLink aria-hidden="true" /></a> : m.title}</strong>
                {m.session_id && <small>{t("Buổi")} {(() => { const s = c.sessions?.find((x) => x.id === m.session_id); return s ? `${dayOf(s.starts_at)} ${timeOf(s.starts_at)}` : ""; })()}</small>}
                {m.note && <p>{m.note}</p>}
              </div>
              {tutor && <Button size="icon" variant="ghost" aria-label={t("Xóa {name}", { name: m.title })} onClick={async () => { if (confirm(t("Xóa bài giảng này?"))) { await api(`/classes/${c.id}/materials/${m.id}`, "DELETE"); onChanged(); } }}><Trash2 /></Button>}
            </li>
          ))}
        </ul>
      ) : <p className="credential-empty">{t(tutor ? "Thêm bài giảng để học sinh xem lại sau mỗi buổi." : "Gia sư chưa thêm bài giảng.")}</p>}
    </section>
  );
}

export function ClassDetail() {
  const { id } = useParams(),
    { user } = useApp(),
    { t } = useI18n(),
    [params, setParams] = useSearchParams(),
    result = useLoad<ClassInfo>(`/classes/${id}`),
    [renewing, setRenewing] = useState(4);
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  const c = result.data, tutor = user?.id === c.tutor_id || user?.role === "admin", parent = user?.learner_type === "parent",
    me = c.members.find((m) => m.student_id === user?.id), watched = watchedPackage(c, user);
  const tab = params.get("tab") || "schedule";
  const visibleStudents = new Set(c.members.map((m) => m.student_id));
  const sessions = (c.sessions || []).filter((s) => tutor || visibleStudents.has(s.student_id ?? 0));
  const lessons = sessions.filter((s, i, a) => a.findIndex((x) => x.id === s.id && (!parent || x.student_id === s.student_id)) === i);
  const upcoming = lessons.filter((s) => Date.parse(s.starts_at) + s.minutes * 60000 > Date.now() && s.status !== "cancelled");
  const past = lessons.filter((s) => !upcoming.includes(s)).reverse();
  const sessionFor = (s: ClassSession) => s;
  async function respond(moveId: number, accept: boolean) {
    try { await api(`/moves/${moveId}`, "PATCH", { accept }); toast.success(t(accept ? "Đã đồng ý dời lịch" : "Đã từ chối dời lịch")); result.reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function endMember(memberId: number, name: string) {
    if (!confirm(t("Kết thúc gói của {name}? Các buổi chưa học trong tương lai sẽ được hoàn tiền cho học sinh.", { name }))) return;
    try { await api(`/admin/members/${memberId}/end`, "POST"); toast.success(t("Đã kết thúc gói")); result.reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <Page>
      <header className="class-hero" data-color={c.color}>
        <Link className="back-link" to="/classes">{t("Lớp học")}</Link>
        <h1>{c.title}</h1>
        <p>{c.subject_name} · {rhythm(c, t)} · {t("{n} phút", { n: c.minutes })} · {t(c.mode === "online" ? "Trực tuyến" : "Trực tiếp")}</p>
        {!tutor && <p className="muted">{t("Gia sư")} {c.tutor_name}</p>}
      </header>
      <ClassStats c={c} tutor={tutor} me={watched} />
      {!parent && (c.moves || []).filter((m) => m.requested_by !== user?.id).map((m) => {
        const s = lessons.find((x) => x.id === m.session_id);
        return s ? (
          <div key={m.id} className="move-request" role="status">
            <span>{t("Đề nghị dời buổi {from} sang {to}", { from: `${dayOf(s.starts_at)} ${timeOf(s.starts_at)}`, to: `${dayOf(m.starts_at)} ${timeOf(m.starts_at)}` })}</span>
            <span className="actions"><Button size="sm" onClick={() => respond(m.id, true)}>{t("Đồng ý")}</Button><Button size="sm" variant="ghost" onClick={() => respond(m.id, false)}>{t("Từ chối")}</Button></span>
          </div>
        ) : null;
      })}
      <nav className="segmented" aria-label={t("Mục lớp học")}>
        {[["schedule", "Lịch học"], ["assignments", "Bài tập"], ["materials", "Bài giảng"], ["people", tutor ? "Học sinh" : "Gói học"], ["messages", "Tin nhắn"]].map(([k, label]) => (
          <a key={k} href={`?tab=${k}`} aria-current={tab === k ? "page" : undefined} onClick={(e) => { e.preventDefault(); setParams({ tab: k }); }}>{t(label)}</a>
        ))}
      </nav>
      {tab === "schedule" && (
        <>
          <ClassPosts c={c} tutor={tutor} onChanged={result.reload} />
          <section className="class-section">
            <header><h2>{t("Sắp tới")}</h2><IcsLink id={c.id} /></header>
            {upcoming.length ? <ul className="session-list">{upcoming.map((s) => <SessionRow key={s.id} s={sessionFor(s)} tutor={tutor} onChanged={result.reload} />)}</ul> : <p className="credential-empty">{t("Không còn buổi sắp tới.")}</p>}
          </section>
          {past.length > 0 && (
            <section className="class-section">
              <header><h2>{t("Đã qua")}</h2></header>
              <ul className="session-list">{past.map((s) => <SessionRow key={s.id} s={sessionFor(s)} tutor={tutor} onChanged={result.reload} />)}</ul>
            </section>
          )}
        </>
      )}
      {tab === "assignments" && <Assignments c={c} tutor={tutor} me={me} readOnly={parent} onChanged={result.reload} />}
      {tab === "materials" && <Materials c={c} tutor={tutor} onChanged={result.reload} />}
      {tab === "messages" && <ClassMessages c={c} tutor={tutor} />}
      {tab === "people" && (
        <section className="class-section">
          <ul className="member-list">
            {c.members.map((m) => {
              const left = m.sessions_total - m.done;
              return (
                <li key={m.id} data-status={m.status}>
                  <Person name={m.name} id={m.student_id} />
                  <div>
                    <strong>{tutor || parent ? m.name : t("Gói của bạn")}</strong>
                    <small>{t("{done}/{total} buổi đã học", { done: m.done, total: m.sessions_total })} · {money(m.rate)}/{t("buổi")}{m.status !== "active" && ` · ${t("Đã kết thúc")}`}</small>
                    <div className="class-progress"><span style={{ width: `${Math.min(100, (m.done / Math.max(1, m.sessions_total)) * 100)}%` }} /></div>
                  </div>
                  <span className="member-actions">
                    {tutor && m.status === "active" && left <= 2 && (
                      <Button size="sm" variant="outline" onClick={async () => { try { await api(`/members/${m.id}/remind`, "POST"); toast.success(t("Đã nhắc gia hạn")); } catch (e) { toast.error((e as Error).message); } }}>
                        <BellRing data-icon="inline-start" />{t("Nhắc gia hạn")}
                      </Button>
                    )}
                    {user?.role === "admin" && m.status === "active" && (
                      <Button size="sm" variant="ghost" className="member-end" onClick={() => endMember(m.id, m.name)}>{t("Kết thúc gói")}</Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {me && me.status === "active" && (
            <form className="renew-form" onSubmit={async (e) => {
              e.preventDefault();
              try { await api(`/members/${me.id}/renew`, "POST", { sessions: renewing }); celebrate(e.currentTarget as HTMLElement); toast.success(t("Đã gia hạn {n} buổi", { n: renewing })); result.reload(); }
              catch (err) { toast.error((err as Error).message); }
            }}>
              <Field><FieldLabel htmlFor="renew">{t("Gia hạn thêm (buổi)")}</FieldLabel><Input id="renew" type="number" min={1} max={60} value={renewing} onChange={(e) => setRenewing(Number(e.target.value))} /></Field>
              <Button type="submit">{t("Gia hạn {amount}", { amount: money(renewing * me.rate) })}</Button>
            </form>
          )}
          {me && me.status === "ended" && <Review memberId={me.id} initial={me.review} rating={me.published_rating} />}
        </section>
      )}
    </Page>
  );
}

function SessionRow({ s, tutor, onChanged }: { s: ClassSession; tutor: boolean; onChanged: () => void }) {
  const { user } = useApp(), { t } = useI18n();
  if (user?.role === "admin")
    return (
      <li className="session-row" data-color={s.color}>
        <time dateTime={s.starts_at}><strong>{dayOf(s.starts_at)}</strong><span>{timeOf(s.starts_at)}</span></time>
        <div>
          <span>{s.student_name} · {t(({ pending: "Chờ xác nhận", confirmed: "Đã xác nhận", charged: "Hủy sát giờ, vẫn tính phí", refunded: "Đã hủy, hoàn tiền", disputed: "Đang xử lý báo cáo" } as Record<string, string>)[s.outcome || ""] || (s.status === "cancelled" ? "Đã hủy" : "Đã lên lịch"))}</span>
          {s.status === "scheduled" && (
            <Button size="sm" variant="ghost" className="danger-text" onClick={async () => {
              const note = prompt(t("Lý do hủy buổi (gửi cho hai bên)"));
              if (!note) return;
              try { await api(`/admin/sessions/${s.id}/cancel`, "POST", { note }); onChanged(); } catch (e) { toast.error((e as Error).message); }
            }}>{t("Hủy buổi (quản trị)")}</Button>
          )}
        </div>
      </li>
    );
  return (
    <li className="session-row" data-color={s.color}>
      <time dateTime={s.starts_at}><strong>{dayOf(s.starts_at)}</strong><span>{timeOf(s.starts_at)}</span></time>
      <div>
        <span>{tutor || user?.learner_type === "parent" ? s.student_name : s.tutor_name}{s.moved_from && ` · ${t("đã dời lịch")}`}</span>
        {user?.learner_type !== "parent" && <SessionActions s={s} onChanged={onChanged} />}
        <SessionNote s={s} tutor={tutor} onChanged={onChanged} />
      </div>
    </li>
  );
}

function Review({ memberId, initial, rating }: { memberId: number; initial: string; rating: number | null }) {
  const { t } = useI18n(), [body, setBody] = useState(initial);
  return (
    <form className="review-form" onSubmit={async (e) => { e.preventDefault(); try { await api(`/members/${memberId}/review`, "PUT", { body }); toast.success(t("Đã lưu nhận xét")); } catch (err) { toast.error((err as Error).message); } }}>
      <p>{rating ? t("Số sao công khai từ các buổi bạn chấm: {n}/5", { n: rating }) : t("Bạn chưa chấm buổi nào nên gói này không có số sao công khai.")}</p>
      <Field><FieldLabel htmlFor="review-body">{t("Nhận xét công khai (không bắt buộc)")}</FieldLabel><Textarea id="review-body" rows={3} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <Button type="submit" variant="outline">{t("Lưu nhận xét")}</Button>
    </form>
  );
}

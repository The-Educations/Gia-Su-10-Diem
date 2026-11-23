import { ChatComposer } from "@/components/chat-composer";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, FileText, Pin, Search, ShieldCheck, X } from "lucide-react";
import { api, useApp, useLoad, dateTime } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import type { Booking, Inquiry, Message as MessageData, MessageContext } from "@/lib/types";
import { MessageContextCard } from "@/components/message-context-card";
import { Page, Heading, Person, State, Blank, Loading, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Message, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";

type Thread = {
  key: string;
  id: number;
  kind: "lesson" | "inquiry" | "support";
  name: string;
  detail: string;
  time: string;
  status?: string;
  tutorId: number;
  personId?: number;
  endpoint: string;
  scheduleHref?: string;
  inactive?: boolean;
  context?: MessageContext;
  unread: number;
  last: string;
  lastAt: string;
  lastSender?: string | null;
  lastIsEvent?: number | null;
};
type ChatMessage = MessageData & { pending?: boolean };
const PAGE = 40;
const msgDate = (iso: string) => new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
const sameDay = (a?: ChatMessage, b?: ChatMessage) => !!a && !!b && a.created_at.slice(0, 10) === b.created_at.slice(0, 10);

function dayLabel(iso: string, t: (s: string) => string, lang: string) {
  const d = msgDate(iso), now = new Date();
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(now)) return t("Hôm nay");
  if (key(d) === key(new Date(Date.now() - 86400000))) return t("Hôm qua");
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function Attachment({ m }: { m: ChatMessage }) {
  const { t } = useI18n();
  const a = m.attachment;
  if (!a) return null;
  if (a.kind === "image") return <a href={a.url} target="_blank" rel="noreferrer" aria-label={t("Mở ảnh đính kèm")}><img className="chat-image" src={a.url} alt={t("Ảnh đính kèm")} loading="lazy" /></a>;
  if (a.kind === "file") return <a className="chat-file" href={a.url} download={a.name} aria-label={`${t("Tải tệp")} ${a.name}`}><FileText aria-hidden="true" /><span>{a.name}</span><small>{a.size < 1048576 ? `${Math.max(1, Math.round(a.size / 1024))} KB` : `${(a.size / 1048576).toFixed(1)} MB`}</small></a>;
  return <audio className="chat-audio" src={a.url} controls preload="none" aria-label={`${t("Tin nhắn thoại từ")} ${m.name}`} />;
}
function ChatEvent({ m }: { m: ChatMessage }) {
  const { t } = useI18n();
  const Icon = m.context?.kind === "offer" || m.context?.kind === "proposal" ? FileText : CalendarDays;
  return (
    <div className="chat-event" data-mid={m.id}>
      <Icon size={14} aria-hidden="true" />
      <div className="chat-event-body">
        <span>{m.name} {t(m.body)}</span>
        {!m.context && m.event_href && <Link className="chat-event-link" to={m.event_href}>{t("Xem chi tiết")}</Link>}
        {m.context && <MessageContextCard context={m.context} />}
        <time>{dateTime(m.created_at)}</time>
      </div>
    </div>
  );
}

function Conversation({ thread, onRead }: { thread: Thread; onRead: (key: string) => void }) {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const [params, setParams] = useSearchParams();
  const hasContext = thread.kind === "inquiry" && (params.has("context") || params.has("contextId"));
  const contextResult = useLoad<MessageContext>(hasContext ? `/inquiries/${thread.id}/context/${encodeURIComponent(params.get("context") || "unknown")}/${encodeURIComponent(params.get("contextId") || "0")}` : null);
  const context = hasContext ? contextResult.data : thread.context;
  const contextReady = !hasContext || (!!context && !contextResult.error && !contextResult.loading);
  function chooseContext(next: MessageContext | null) {
    setParams((previous) => {
      const nextParams = new URLSearchParams(previous);
      nextParams.delete("context"); nextParams.delete("contextId");
      if (next) { nextParams.set("context", next.kind); nextParams.set("contextId", String(next.id)); }
      return nextParams;
    });
    document.getElementById("message")?.focus();
  }
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [moreBusy, setMoreBusy] = useState(false),
    wrapRef = useRef<HTMLDivElement>(null),
    anchor = useRef(0),
    flashed = useRef(false),
    target = params.get("m");
  async function pull() {
    const data = await api<ChatMessage[] | { messages: ChatMessage[]; hasMore: boolean }>(`${thread.endpoint}?limit=${PAGE}`);
    if (Array.isArray(data)) { setMessages(data); setHasMore(false); }
    else { setMessages(data.messages); setHasMore(data.hasMore); }
    setError("");
    void api(`/chat/${thread.kind}/${thread.id}/read`, "POST").then(() => onRead(thread.key)).catch(() => {});
  }
  useEffect(() => {
    let active = true;
    setMessages([]); setLoading(true); setError(""); flashed.current = false;
    (async () => {
      try { const data = await api<ChatMessage[] | { messages: ChatMessage[]; hasMore: boolean }>(`${thread.endpoint}?limit=${PAGE}`);
        if (active) {
          if (Array.isArray(data)) { setMessages(data); setHasMore(false); } else { setMessages(data.messages); setHasMore(data.hasMore); }
          setError("");
          void api(`/chat/${thread.kind}/${thread.id}/read`, "POST").then(() => onRead(thread.key)).catch(() => {});
        }
      } catch (e) { if (active) setError((e as Error).message); }
      finally { if (active) setLoading(false); }
    })();
    const timer = setInterval(() => { if (!document.hidden) pull().catch(() => {}); }, 6000);
    return () => { active = false; clearInterval(timer); };
  }, [thread.endpoint, retry]);
  // Restore the viewport position when an older page is prepended.
  useLayoutEffect(() => {
    const vp = wrapRef.current?.querySelector<HTMLElement>("[data-slot='message-scroller-viewport']");
    if (vp && anchor.current) { vp.scrollTop += vp.scrollHeight - anchor.current; anchor.current = 0; }
  }, [messages]);
  // Deep link ?m=<id>: scroll to the message and pulse it once.
  useEffect(() => {
    if (!target || flashed.current || !messages.some((m) => m.id === Number(target))) return;
    const el = wrapRef.current?.querySelector(`[data-mid="${target}"]`);
    if (!el) return;
    flashed.current = true;
    el.scrollIntoView({ block: "center" });
    el.classList.add("flash");
  }, [target, messages]);
  async function loadMore() {
    const first = messages.find((m) => m.id > 0)?.id;
    if (!first || moreBusy) return;
    setMoreBusy(true);
    const vp = wrapRef.current?.querySelector<HTMLElement>("[data-slot='message-scroller-viewport']");
    anchor.current = vp?.scrollHeight || 0;
    try {
      const page = await api<{ messages: ChatMessage[]; hasMore: boolean }>(`${thread.endpoint}?limit=${PAGE}&before=${first}`);
      setMessages((m) => [...page.messages, ...m]);
      setHasMore(page.hasMore);
    } catch (e) { setError((e as Error).message); }
    finally { setMoreBusy(false); }
  }
  async function send(body: string, attachment_id?: string) {
    if (/(?:\+84|0)\s?\d(?:[\s.-]?\d){7,9}|[^\s@]+@[^\s@]+\.[^\s@]+|\b(?:zalo|facebook|fb|messenger|telegram|whatsapp|viber)\b/i.test(body))
      toast.warning(t("Tin nhắn có thông tin liên hệ — nội dung đó sẽ bị che với người nhận."));
    const temp: ChatMessage = { id: -Date.now(), booking_id: thread.id, sender_id: user!.id, name: user!.name, body, created_at: new Date().toISOString(), pending: true };
    setMessages((m) => [...m, temp]);
    try {
      await api(thread.endpoint, "POST", { body, attachment_id, ...(thread.kind === "inquiry" && context ? { context: { kind: context.kind, id: context.id } } : {}) });
      await pull();
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      throw e; // let the composer keep the draft and pending attachment
    }
  }
  const rows = useMemo(() => messages.map((m, i) => {
    const prev = messages[i - 1], next = messages[i + 1];
    return {
      m,
      newDay: !sameDay(prev, m),
      first: !prev || !!prev.is_event || !!m.is_event || prev.sender_id !== m.sender_id || !sameDay(prev, m),
      last: !next || !!next.is_event || !!m.is_event || next.sender_id !== m.sender_id || !sameDay(m, next),
    };
  }), [messages]);
  return (
    <>
      <header className="conversation-heading">
        <div>
          <strong>{thread.name}</strong>
          <span>{thread.detail}</span>
        </div>
        <div className="conversation-heading-actions">
          {thread.scheduleHref && <Button variant="outline" size="sm" asChild><Link to={thread.scheduleHref}>{user?.role === "tutor" ? t("Xem lịch dạy") : t("Xem lịch học")}</Link></Button>}
          {thread.kind === "support" ? <ShieldCheck aria-label={t("Hỗ trợ quản trị")} /> : thread.status ? (
            <State value={thread.status} />
          ) : user?.role !== "tutor" ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/tutors/${thread.tutorId}`}>{t("Xem hồ sơ")}</Link>
            </Button>
          ) : null}
        </div>
      </header>
      {thread.kind === "support" && user?.role !== "admin" && <aside className="support-welcome" aria-label={t("Tin nhắn được ghim")}><Pin size={16} aria-hidden="true" /><div><strong>{t("Hỗ trợ Gia Sư 10 Điểm")}</strong><p>{t("Chào bạn! Gửi tin nhắn tại đây để được quản trị viên hỗ trợ.")}</p><a href="mailto:admin@giasudiem10.online">admin@giasudiem10.online</a></div></aside>}
      {error && <ErrorState error={error} retry={() => setRetry((r) => r + 1)} />}
      <div className="conversation-body" ref={wrapRef}>
        {loading ? (
          <Loading />
        ) : (
          <MessageScrollerProvider key={thread.key} autoScroll>
            <MessageScroller>
              <MessageScrollerViewport aria-label={t("Nội dung trò chuyện")}>
                <MessageScrollerContent className="gap-1.5 p-5">
                  {hasMore && (
                    <div className="chat-more">
                      <Button variant="ghost" size="sm" disabled={moreBusy} onClick={loadMore}>{moreBusy ? t("Đang tải…") : t("Tải thêm tin nhắn cũ")}</Button>
                    </div>
                  )}
                  {!messages.length && thread.kind !== "support" && (
                    <Blank title={t("Bắt đầu cuộc trò chuyện")} description={t("Gửi lời nhắn để bắt đầu trao đổi.")} />
                  )}
                  {rows.map(({ m, newDay, first, last }) => (
                    <MessageScrollerItem key={m.id} messageId={String(m.id)}>
                      {newDay && <div className="chat-day" role="separator"><span>{dayLabel(m.created_at, t, lang)}</span></div>}
                      {m.is_event ? (
                        <ChatEvent m={m} />
                      ) : (
                        <div data-mid={m.id} data-flash>
                          <Message align={m.sender_id === user?.id ? "end" : "start"}>
                            <MessageContent>
                              {first && m.sender_id !== user?.id && <MessageHeader>{m.name}</MessageHeader>}
                              {thread.kind === "inquiry" && m.context && <MessageContextCard context={m.context} onReply={() => chooseContext(m.context!)} />}
                              {m.context_kind && !m.context && <span className="muted">{t("Nội dung liên quan không còn khả dụng.")}</span>}
                              {m.body && (
                                <Bubble variant={m.sender_id === user?.id ? "default" : "secondary"}>
                                  <BubbleContent className="whitespace-pre-wrap">{m.body}</BubbleContent>
                                </Bubble>
                              )}
                              {!!m.masked && m.sender_id === user?.id && <small className="muted">{t("Đã ẩn thông tin liên hệ theo chính sách")}</small>}
                              {m.attachment && (
                                <Bubble variant={m.sender_id === user?.id ? "default" : "secondary"}>
                                  <BubbleContent><Attachment m={m} /></BubbleContent>
                                </Bubble>
                              )}
                              {last && <MessageFooter>{m.pending ? t("Đang gửi…") : dateTime(m.created_at)}</MessageFooter>}
                            </MessageContent>
                          </Message>
                        </div>
                      )}
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton behavior="auto" aria-label={t("Đến tin nhắn mới nhất")} />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </div>
      {!thread.inactive && (user?.role !== "admin" || thread.kind === "support") && (
        <>
          {(hasContext || context) && <aside className="message-context-draft" aria-label={t("Ngữ cảnh tin nhắn")}>
            {contextResult.loading ? <Loading /> : contextResult.error ? <ErrorState error={contextResult.error} retry={contextResult.reload} /> : context && <MessageContextCard context={context} />}
            {hasContext && <Button variant="ghost" size="icon" aria-label={t("Bỏ ngữ cảnh tin nhắn")} onClick={() => chooseContext(null)}><X aria-hidden="true" /></Button>}
          </aside>}
          {thread.kind === "lesson" ? (
            <p className="legacy-note muted">{t("Luồng đặt lịch cũ đã ngừng — cuộc trò chuyện này chỉ đọc. Lịch sử ở Lớp học.")}</p>
          ) : (
            <ChatComposer uploadPath={`/chat/${thread.kind}/${thread.id}/attachments`} ready={contextReady} onSend={send} />
          )}
        </>
      )}
    </>
  );
}

const KIND_FILTERS: [string, string][] = [["all", "Tất cả"], ["lesson", "Lớp học"], ["inquiry", "Đề nghị"], ["support", "Hỗ trợ"]];
export default function Messages() {
  const { t, lang, ago } = useI18n();
  const { user } = useApp(),
    bookings = useLoad<Booking[]>("/bookings"),
    inquiries = useLoad<Inquiry[]>(user?.role === "admin" ? null : "/inquiries"),
    support = useLoad<{ id: number; user_id: number; name: string; role: string; learner_type: string; status: string; created_at: string; last_message?: string; last_message_at?: string; last_sender?: string | null; last_is_event?: number | null; unread_count?: number }[]>("/support"),
    [params, setParams] = useSearchParams(),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState("all"),
    [readKeys, setReadKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) { support.reload(); inquiries.reload(); bookings.reload(); }
    }, 15000);
    return () => clearInterval(timer);
  }, [user?.id]);
  const threads: Thread[] = [
    ...(support.data || []).map((s) => ({
      key: `support-${s.id}`, id: s.id, kind: "support" as const,
      name: user?.role === "admin" ? s.name : t("Hỗ trợ Gia Sư 10 Điểm"),
      detail: user?.role === "admin" ? `${t("Hỗ trợ")} · ${s.role === "tutor" ? t("Gia sư") : s.learner_type === "parent" ? t("Phụ huynh") : t("Học sinh")}` : "admin@giasudiem10.online",
      time: s.last_message_at || s.created_at, tutorId: s.user_id, endpoint: `/support/${s.id}/messages`, inactive: s.status !== "active",
      unread: s.unread_count || 0, last: s.last_message || "", lastAt: s.last_message_at || s.created_at,
      lastSender: s.last_sender, lastIsEvent: s.last_is_event,
    })),
    ...(inquiries.data || []).map((i) => ({
      key: `inquiry-${i.id}`,
      id: i.id,
      kind: "inquiry" as const,
      name: user?.role === "tutor" ? i.student_name : i.tutor_name,
      detail: (bookings.data || []).some((b) => b.inquiry_id === i.id) ? t("Trao đổi lịch học & bài tập") : t("Tư vấn trước buổi học"),
      scheduleHref: (bookings.data || []).some((b) => b.inquiry_id === i.id) ? `/app/classes?inquiry=${i.id}` : undefined,
      time: i.last_message_at || i.created_at,
      tutorId: i.tutor_id,
      personId: user?.role === "tutor" ? i.student_id : i.tutor_id,
      endpoint: `/inquiries/${i.id}/messages`,
      unread: i.unread_count || 0, last: i.last_message || "", lastAt: i.last_message_at || i.created_at,
      lastSender: i.last_sender, lastIsEvent: i.last_is_event,
    })),
    ...(bookings.data || []).filter((b) => !b.offer_id).map((b) => ({
      key: `lesson-${b.id}`,
      id: b.id,
      kind: "lesson" as const,
      name: user?.role === "tutor" ? b.student_name : b.tutor_name,
      detail: `${b.subject_name} · ${dateTime(b.starts_at)}`,
      time: b.last_message_at || b.starts_at,
      status: b.status,
      tutorId: b.tutor_id,
      personId: user?.role === "tutor" ? b.student_id : b.tutor_id,
      endpoint: `/bookings/${b.id}/messages`,
      scheduleHref: `/app/classes?lesson=${b.id}`,
      context: { kind: "lesson" as const, id: b.id, subject_name: b.subject_name, status: b.status, starts_at: b.starts_at, duration_minutes: b.duration_minutes },
      unread: b.unread_count || 0, last: b.last_message || "", lastAt: b.last_message_at || b.starts_at,
      lastSender: b.last_sender, lastIsEvent: b.last_is_event,
    })),
  ];
  threads.sort((a, b) => (a.kind === "support" ? 0 : 1) - (b.kind === "support" ? 0 : 1) || msgDate(b.lastAt).getTime() - msgDate(a.lastAt).getTime());
  const needle = q.trim().toLowerCase();
  const visible = threads.filter((th) => (filter === "all" || th.kind === filter) && (!needle || th.name.toLowerCase().includes(needle) || th.last.toLowerCase().includes(needle)));
  const selected = threads.find((th) => params.get("c") === th.key) || threads.find((th) => params.get(th.kind) === String(th.id)) || (!params.size && user?.role !== "admin" ? threads.find((th) => th.kind === "support") : undefined),
    error = bookings.error || inquiries.error || support.error;
  return (
    <Page>
      <Heading title={t("Tin nhắn")} />
      {bookings.loading || inquiries.loading || support.loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={() => { bookings.reload(); inquiries.reload(); support.reload(); }} />
      ) : !threads.length ? (
        <Blank
          title={t("Chưa có cuộc trò chuyện")}
          description={user?.role === "admin" ? t("Tin nhắn hỗ trợ sẽ xuất hiện khi người dùng liên hệ.") : t("Liên hệ gia sư từ hồ sơ để bắt đầu trao đổi.")}
          action={user?.role !== "admin" && <Button variant="outline" asChild><Link to="/tutors">{t("Tìm gia sư")}</Link></Button>}
        />
      ) : (
        <div className={`inbox ${selected ? "has-selection" : ""}`}>
          <aside className="conversation-list" aria-label={t("Cuộc trò chuyện")}>
            <div className="conversation-tools">
              <label className="conversation-search">
                <Search size={15} aria-hidden="true" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Tìm cuộc trò chuyện")} aria-label={t("Tìm cuộc trò chuyện")} />
              </label>
              <div className="conversation-filter" role="group" aria-label={t("Lọc theo loại")}>
                {KIND_FILTERS.map(([kind, label]) => (
                  <button type="button" key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{t(label)}</button>
                ))}
              </div>
            </div>
            {!visible.length && <p className="conversation-none">{t("Không có cuộc trò chuyện nào khớp.")}</p>}
            {visible.map((th) => {
              const unread = readKeys.has(th.key) ? 0 : th.unread;
              return (
                <button
                  key={th.key}
                  className={th.key === selected?.key ? "selected" : ""}
                  onClick={() => setParams({ [th.kind]: String(th.id) })}
                >
                  {th.kind === "support" ? <ShieldCheck size={24} aria-hidden="true" /> : <Person name={th.name} id={th.personId ?? th.tutorId} />}
                  <div>
                    <strong data-unread={unread > 0 || undefined}>{th.name}{th.kind === "support" && user?.role !== "admin" && <Pin size={13} aria-label={t("Đã ghim")} />}</strong>
                    <span>{th.lastIsEvent && th.lastSender ? `${th.lastSender} ${t(th.last)}` : th.last || th.detail}</span>
                    <small>{th.last ? `${th.detail} · ` : ""}{ago(th.lastAt)}</small>
                  </div>
                  {unread > 0 && <em className="conversation-unread" aria-label={t("{n} tin chưa đọc", { n: unread })}>{unread}</em>}
                </button>
              );
            })}
          </aside>
          <section className="conversation">
            <Button className="conversation-back" variant="ghost" onClick={() => setParams({ view: "inbox" })}>
              <ArrowLeft data-icon="inline-start" />
              {t("Cuộc trò chuyện")}
            </Button>
            {selected ? (
              <Conversation key={selected.key} thread={selected} onRead={(key) => setReadKeys((s) => new Set(s).add(key))} />
            ) : (
              <Blank title={t("Chọn một cuộc trò chuyện")} />
            )}
          </section>
        </div>
      )}
    </Page>
  );
}

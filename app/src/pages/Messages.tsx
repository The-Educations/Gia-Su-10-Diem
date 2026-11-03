import { ChatComposer } from "@/components/chat-composer";
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Pin, ShieldCheck, X } from "lucide-react";
import { api, useApp, useLoad, dateTime } from "@/lib/api";
import type { Booking, Inquiry, Message as MessageData, MessageContext } from "@/lib/types";
import { MessageContextCard } from "@/components/message-context-card";
import {
  Page,
  Heading,
  Person,
  State,
  Blank,
  Loading,
  ErrorState,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageContent,
  MessageHeader,
  MessageFooter,
} from "@/components/ui/message";
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
};
function Conversation({ thread }: { thread: Thread }) {
  const [params, setParams] = useSearchParams();
  const hasContext = thread.kind === "inquiry" && (params.has("context") || params.has("contextId"));
  const contextResult = useLoad<MessageContext>(hasContext ? `/inquiries/${thread.id}/context/${encodeURIComponent(params.get("context") || "unknown")}/${encodeURIComponent(params.get("contextId") || "0")}` : null);
  const context = hasContext ? contextResult.data : thread.context;
  const contextReady = !hasContext || (!!context && !contextResult.error && !contextResult.loading);
  function chooseContext(next: MessageContext | null) {
    setParams(previous => {
      const nextParams = new URLSearchParams(previous);
      nextParams.delete("context"); nextParams.delete("contextId");
      if (next) { nextParams.set("context", next.kind); nextParams.set("contextId", String(next.id)); }
      return nextParams;
    });
    document.getElementById("message")?.focus();
  }
  const { user } = useApp(),
    [messages, setMessages] = useState<MessageData[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setMessages([]);
    setLoading(true);
    setError("");
    async function load() {
      try {
        const data = await api<MessageData[]>(thread.endpoint);
        if (active) {
          setMessages(data);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [thread.endpoint, retry]);
  async function send(body: string, attachment_id?: string) {
    await api(thread.endpoint, "POST", { body, attachment_id, ...(thread.kind === "inquiry" && context ? { context: { kind: context.kind, id: context.id } } : {}) });
    setError("");
    try { setMessages(await api(thread.endpoint)); }
    catch (e) { setError((e as Error).message); }
  }
  return (
    <>
      <header className="conversation-heading">
        <div>
          <strong>{thread.name}</strong>
          <span>{thread.detail}</span>
        </div>
        <div className="conversation-heading-actions">
        {thread.scheduleHref && <Button variant="outline" size="sm" asChild><Link to={thread.scheduleHref}>{user?.role === "tutor" ? "Xem lịch dạy" : "Xem lịch học"}</Link></Button>}
        {thread.kind === "support" ? <ShieldCheck aria-label="Hỗ trợ quản trị" /> : thread.status ? (
          <State value={thread.status} />
        ) : user?.role !== "tutor" ? (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/tutors/${thread.tutorId}`}>Xem hồ sơ</Link>
          </Button>
        ) : null}
        </div>
      </header>
      {thread.kind === "support" && user?.role !== "admin" && <aside className="support-welcome" aria-label="Tin nhắn được ghim"><Pin size={16} aria-hidden="true" /><div><strong>Hỗ trợ Gia Sư 10 Điểm</strong><p>Chào bạn! Gửi tin nhắn tại đây để được quản trị viên hỗ trợ.</p><a href="mailto:admin@giasudiem10.online">admin@giasudiem10.online</a></div></aside>}
      {error && (
        <ErrorState error={error} retry={() => setRetry((r) => r + 1)} />
      )}
      <div className="conversation-body">
        {loading ? (
          <Loading />
        ) : (
          <MessageScrollerProvider key={thread.key} autoScroll>
            <MessageScroller>
              <MessageScrollerViewport aria-label="Nội dung trò chuyện">
                <MessageScrollerContent className="p-5">
                  {!messages.length && thread.kind !== "support" && (
                    <Blank
                      title="Bắt đầu cuộc trò chuyện"
                      description="Gửi lời nhắn để bắt đầu trao đổi."
                    />
                  )}
                  {messages.map((m) => (
                    <MessageScrollerItem key={m.id} messageId={String(m.id)}>
                      <Message
                        align={m.sender_id === user?.id ? "end" : "start"}
                      >
                        <MessageContent>
                          <MessageHeader>{m.name}</MessageHeader>
                          {m.context && <MessageContextCard context={m.context} onReply={thread.kind === "inquiry" ? () => chooseContext(m.context!) : undefined} />}
                          {m.context_kind && !m.context && <span className="muted">Nội dung liên quan không còn khả dụng.</span>}
                          <Bubble
                            variant={
                              m.sender_id === user?.id ? "default" : "secondary"
                            }
                          >
                            <BubbleContent className="whitespace-pre-wrap">
                              {m.body}
                              {m.attachment && (m.attachment.kind === "image" ? <a href={m.attachment.url} target="_blank" rel="noreferrer" aria-label="Mở ảnh đính kèm"><img className="chat-image" src={m.attachment.url} alt="Ảnh đính kèm" loading="lazy" /></a> : <audio className="chat-audio" src={m.attachment.url} controls preload="none" aria-label={`Tin nhắn thoại từ ${m.name}`} />)}
                            </BubbleContent>
                          </Bubble>
                          <MessageFooter>
                            {dateTime(m.created_at)}
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton
                behavior="auto"
                aria-label="Đến tin nhắn mới nhất"
              />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </div>
      {!thread.inactive && (user?.role !== "admin" || thread.kind === "support") && (
        <>
        {(hasContext || context) && <aside className="message-context-draft" aria-label="Ngữ cảnh tin nhắn">
          {contextResult.loading ? <Loading /> : contextResult.error ? <ErrorState error={contextResult.error} retry={contextResult.reload} /> : context && <MessageContextCard context={context} />}
          {hasContext && <Button variant="ghost" size="icon" aria-label="Bỏ ngữ cảnh tin nhắn" onClick={() => chooseContext(null)}><X aria-hidden="true" /></Button>}
        </aside>}
        <ChatComposer uploadPath={`/chat/${thread.kind}/${thread.id}/attachments`} ready={contextReady} onSend={send} />
        </>
      )}
    </>
  );
}
export default function Messages() {
  const { user } = useApp(),
    bookings = useLoad<Booking[]>("/bookings"),
    inquiries = useLoad<Inquiry[]>(
      user?.role === "admin" ? null : "/inquiries",
    ),
    support = useLoad<{ id: number; user_id: number; name: string; role: string; learner_type: string; status: string; created_at: string }[]>("/support"),
    [params, setParams] = useSearchParams();
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) { support.reload(); inquiries.reload(); bookings.reload(); }
    }, 15000);
    return () => clearInterval(timer);
  }, [user?.id]);
  const threads: Thread[] = [
    ...(support.data || []).map(s => ({
      key: `support-${s.id}`, id: s.id, kind: "support" as const,
      name: user?.role === "admin" ? s.name : "Hỗ trợ Gia Sư 10 Điểm",
      detail: user?.role === "admin" ? `Hỗ trợ · ${s.role === "tutor" ? "Gia sư" : s.learner_type === "parent" ? "Phụ huynh" : "Học sinh"}` : "admin@giasudiem10.online",
      time: s.created_at, tutorId: s.user_id, endpoint: `/support/${s.id}/messages`, inactive: s.status !== "active",
    })),
    ...(inquiries.data || []).map((i) => ({
      key: `inquiry-${i.id}`,
      id: i.id,
      kind: "inquiry" as const,
      name: user?.role === "tutor" ? i.student_name : i.tutor_name,
      detail: (bookings.data || []).some(b => b.inquiry_id === i.id) ? "Trao đổi lịch học & bài tập" : "Tư vấn trước buổi học",
      scheduleHref: (bookings.data || []).some(b => b.inquiry_id === i.id) ? `/bookings?inquiry=${i.id}` : undefined,
      time: i.created_at,
      tutorId: i.tutor_id,
      personId: user?.role === "tutor" ? i.student_id : i.tutor_id,
      endpoint: `/inquiries/${i.id}/messages`,
    })),
    ...(bookings.data || []).filter(b => !b.offer_id).map((b) => ({
      key: `lesson-${b.id}`,
      id: b.id,
      kind: "lesson" as const,
      name: user?.role === "tutor" ? b.student_name : b.tutor_name,
      detail: `${b.subject_name} · ${dateTime(b.starts_at)}`,
      time: b.starts_at,
      status: b.status,
      tutorId: b.tutor_id,
      personId: user?.role === "tutor" ? b.student_id : b.tutor_id,
      endpoint: `/bookings/${b.id}/messages`,
      scheduleHref: `/bookings?lesson=${b.id}`,
      context: { kind: "lesson" as const, id: b.id, subject_name: b.subject_name, status: b.status, starts_at: b.starts_at, duration_minutes: b.duration_minutes },
    })),
  ];
  const selected = threads.find((t) => params.get(t.kind) === String(t.id)) || (!params.size && user?.role !== "admin" ? threads.find(t => t.kind === "support") : undefined),
    error = bookings.error || inquiries.error || support.error;
  return (
    <Page>
      <Heading title="Tin nhắn" />
      {bookings.loading || inquiries.loading || support.loading ? (
        <Loading />
      ) : error ? (
        <ErrorState
          error={error}
          retry={() => {
            bookings.reload();
            inquiries.reload();
            support.reload();
          }}
        />
      ) : !threads.length ? (
        <Blank
          title="Chưa có cuộc trò chuyện"
          description={user?.role === "admin" ? "Tin nhắn hỗ trợ sẽ xuất hiện khi người dùng liên hệ." : "Liên hệ gia sư từ hồ sơ để bắt đầu trao đổi."}
          action={user?.role !== "admin" &&
            <Button variant="outline" asChild>
              <Link to="/tutors">Tìm gia sư</Link>
            </Button>
          }
        />
      ) : (
        <div className={`inbox ${selected ? "has-selection" : ""}`}>
          <aside className="conversation-list" aria-label="Cuộc trò chuyện">
            {threads.map((t) => (
              <button
                key={t.key}
                className={t.key === selected?.key ? "selected" : ""}
                onClick={() => setParams({ [t.kind]: String(t.id) })}
              >
                {t.kind === "support" ? <ShieldCheck size={24} aria-hidden="true" /> : <Person name={t.name} id={t.personId ?? t.tutorId} />}
                <div>
                  <strong>{t.name}{t.kind === "support" && user?.role !== "admin" && <Pin size={13} aria-label="Đã ghim" />}</strong>
                  <span>
                    {t.detail}
                  </span>
                  <small>{dateTime(t.time)}</small>
                </div>
              </button>
            ))}
          </aside>
          <section className="conversation">
            <Button
              className="conversation-back"
              variant="ghost"
              onClick={() => setParams({ view: "inbox" })}
            >
              <ArrowLeft data-icon="inline-start" />
              Cuộc trò chuyện
            </Button>
            {selected ? (
              <Conversation key={selected.key} thread={selected} />
            ) : (
              <Blank title="Chọn một cuộc trò chuyện" />
            )}
          </section>
        </div>
      )}
    </Page>
  );
}

import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { api, useApp, useLoad, dateTime } from "@/lib/api";
import type { Booking, Inquiry, Message as MessageData } from "@/lib/types";
import {
  Page,
  Heading,
  Person,
  State,
  Blank,
  Loading,
  ErrorState,
  Submit,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
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
  kind: "lesson" | "inquiry";
  name: string;
  detail: string;
  time: string;
  status?: string;
  tutorId: number;
  endpoint: string;
};
function Conversation({ thread }: { thread: Thread }) {
  const { user } = useApp(),
    [messages, setMessages] = useState<MessageData[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setMessages([]);
    setBody("");
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
  async function send(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(thread.endpoint, "POST", { body });
      setBody("");
      setMessages(await api(thread.endpoint));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="conversation-heading">
        <div>
          <strong>{thread.name}</strong>
          <span>{thread.detail}</span>
        </div>
        {thread.status ? (
          <State value={thread.status} />
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/tutors/${thread.tutorId}`}>Xem hồ sơ</Link>
          </Button>
        )}
      </header>
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
                  {!messages.length && (
                    <Blank
                      title="Bắt đầu cuộc trò chuyện"
                      description="Trao đổi mục tiêu học tập hoặc nội dung buổi học."
                    />
                  )}
                  {messages.map((m) => (
                    <MessageScrollerItem key={m.id} messageId={String(m.id)}>
                      <Message
                        align={m.sender_id === user?.id ? "end" : "start"}
                      >
                        <MessageContent>
                          <MessageHeader>{m.name}</MessageHeader>
                          <Bubble
                            variant={
                              m.sender_id === user?.id ? "default" : "secondary"
                            }
                          >
                            <BubbleContent className="whitespace-pre-wrap">
                              {m.body}
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
      {user?.role !== "admin" && (
        <form className="message-composer" onSubmit={send}>
          <Field>
            <FieldLabel htmlFor="message" className="sr-only">
              Tin nhắn
            </FieldLabel>
            <Textarea
              id="message"
              placeholder="Nhắn về buổi học…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={3000}
              required
            />
          </Field>
          <Submit busy={busy}>
            <Send data-icon="inline-start" />
            Gửi
          </Submit>
        </form>
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
    [params, setParams] = useSearchParams();
  const threads: Thread[] = [
    ...(inquiries.data || []).map((i) => ({
      key: `inquiry-${i.id}`,
      id: i.id,
      kind: "inquiry" as const,
      name: user?.role === "tutor" ? i.student_name : i.tutor_name,
      detail: "Tư vấn trước buổi học",
      time: i.created_at,
      tutorId: i.tutor_id,
      endpoint: `/inquiries/${i.id}/messages`,
    })),
    ...(bookings.data || []).map((b) => ({
      key: `lesson-${b.id}`,
      id: b.id,
      kind: "lesson" as const,
      name: user?.role === "tutor" ? b.student_name : b.tutor_name,
      detail: `${b.subject_name} · ${dateTime(b.starts_at)}`,
      time: b.starts_at,
      status: b.status,
      tutorId: b.tutor_id,
      endpoint: `/bookings/${b.id}/messages`,
    })),
  ];
  const selected = threads.find((t) => params.get(t.kind) === String(t.id)),
    error = bookings.error || inquiries.error;
  return (
    <Page>
      <Heading title="Tin nhắn" />
      {bookings.loading || inquiries.loading ? (
        <Loading />
      ) : error ? (
        <ErrorState
          error={error}
          retry={() => {
            bookings.reload();
            inquiries.reload();
          }}
        />
      ) : !threads.length ? (
        <Blank
          title="Chưa có cuộc trò chuyện"
          description="Liên hệ gia sư từ hồ sơ để trao đổi trước khi đặt lịch."
          action={
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
                <Person name={t.name} id={t.tutorId} />
                <div>
                  <strong>{t.name}</strong>
                  <span>
                    {t.kind === "inquiry" ? "Tư vấn trước buổi học" : t.detail}
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
              onClick={() => setParams({})}
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

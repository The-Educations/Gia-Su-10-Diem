import { useState } from "react";
import { api, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Loading } from "./common";
import { RowMenu } from "./admin-kit";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Star } from "lucide-react";

type Flag = { id: number; thread_kind: string; thread_id: number; sender_id: number; sender_name: string; student_name: string; tutor_name: string; body: string; original_body: string | null; created_at: string };
type Review = { booking_id: number; rating: number; body: string; hidden: number; reply: string; reported_reason: string; student_name: string; tutor_name: string; created_at: string };

export default function AdminSafety() {
  const { t } = useI18n();
  const flagged = useLoad<Flag[]>("/admin/safety/flagged");
  const reviews = useLoad<Review[]>("/admin/reviews/queue");
  const [thread, setThread] = useState<{ kind: string; thread_id: number; parties: any; messages: any[] } | null>(null);
  const open = (f: Flag) => api<{ kind: string; thread_id: number; parties: any; messages: any[] }>(`/admin/safety/thread/${f.thread_kind}/${f.thread_id}`).then(setThread);
  const act = async (path: string, body?: unknown) => { await api(path, "POST", body); flagged.reload(); reviews.reload(); };
  const when = (s: string) => new Date(s).toLocaleString("vi-VN");
  if (flagged.loading || reviews.loading) return <Loading />;
  return (
    <div className="admin-pane">
      <h3 className="admin-section-title">{t("Tin nhắn bị gắn cờ")}</h3>
      <div className="admin-rows">
        {flagged.data?.map((f) => (
          <article key={`${f.thread_kind}${f.id}`}>
            <span className="admin-row-title"><strong>{f.sender_name}</strong><small>{f.tutor_name} ↔ {f.student_name} · {when(f.created_at)}</small></span>
            <span className="admin-row-meta"><small className="danger-text">{f.body}</small></span>
            <span className="admin-row-state"><span className="session-state" data-state="attention">{t(f.thread_kind === "inquiry" ? "Tư vấn" : "Buổi học")}</span></span>
            <span />
            <RowMenu label={t("Thao tác tin bị cờ")} items={[
              { label: "Xem hội thoại", onSelect: () => open(f) },
              { label: "Bỏ cờ", onSelect: () => act("/admin/safety/dismiss", { kind: f.thread_kind, message_id: f.id }) },
              { label: "Nhắc nhở người gửi", onSelect: () => act("/admin/safety/warn", { kind: f.thread_kind, thread_id: f.thread_id }) },
            ]} />
          </article>
        ))}
        {flagged.data && !flagged.data.length && <p className="admin-row-meta">{t("Không có tin nhắn nào bị gắn cờ")}</p>}
      </div>
      <h3 className="admin-section-title">{t("Đánh giá bị báo cáo")}</h3>
      <div className="admin-rows">
        {reviews.data?.map((r) => (
          <article key={r.booking_id}>
            <span className="admin-row-title"><strong><Star data-icon="inline-start" />{r.rating} · {r.student_name} → {r.tutor_name}</strong><small>{when(r.created_at)}{r.reported_reason ? ` · ${t("Lý do")}: ${r.reported_reason}` : ""}</small></span>
            <span className="admin-row-meta"><small>{r.body}</small>{r.reply ? <small>{t("Phản hồi nền tảng")}: {r.reply}</small> : null}</span>
            <span className="admin-row-state">{!!r.hidden && <span className="session-state" data-state="cancelled">{t("Đã ẩn")}</span>}</span>
            <span />
            <RowMenu label={t("Thao tác đánh giá")} items={[
              r.hidden ? { label: "Hiện lại", onSelect: () => act(`/admin/reviews/${r.booking_id}/visibility`, { hidden: false }) } : { label: "Ẩn đánh giá", onSelect: () => act(`/admin/reviews/${r.booking_id}/visibility`, { hidden: true }) },
              { label: "Trả lời công khai", onSelect: async () => { const body = prompt(t("Nội dung trả lời")); if (body) act(`/admin/reviews/${r.booking_id}/reply`, { body }); } },
            ]} />
          </article>
        ))}
        {reviews.data && !reviews.data.length && <p className="admin-row-meta">{t("Không có đánh giá bị báo cáo")}</p>}
      </div>
      <Sheet open={!!thread} onOpenChange={(o) => !o && setThread(null)}>
        <SheetContent side="right">
          <SheetHeader><SheetTitle>{t("Hội thoại bị gắn cờ (chỉ đọc)")}</SheetTitle></SheetHeader>
          {thread && <p className="admin-row-meta">{thread.parties?.tutor_name} ↔ {thread.parties?.student_name} · {t("lượt xem này được ghi nhật ký")}</p>}
          <div className="safety-thread">
            {thread?.messages?.map((m: any) => (
              <p key={m.id} className="safety-msg" data-flagged={!!m.flagged || undefined}>
                <small>{m.sender_name} · {when(m.created_at)}</small>
                <span>{m.original_body || m.body}</span>
                {m.flagged ? <small className="danger-text">{t("Bản gốc — chỉ admin thấy")}</small> : null}
              </p>
            ))}
          </div>
          <Button variant="outline" onClick={() => setThread(null)}>{t("Đóng")}</Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

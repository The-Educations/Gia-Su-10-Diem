import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { api, money, dateTime, fold, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Blank, ErrorState, Loading } from "./common";
import { AdminSearch, AdminToolbar, FilterChips , AdminAuditTrail} from "./admin-kit";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";
import { dayOf, timeOf } from "./session-actions";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import "@/calendar.css";
import "@/money.css";

type Row = { id: number; title: string; color: string; status: string; tutor_id: number; tutor_name: string; students: string | null; upcoming: number; disputes: number; next_at: string | null };

export function AdminClasses() {
  const { t } = useI18n(), result = useLoad<Row[]>("/admin/classes"), [q, setQ] = useState(""), [show, setShow] = useState("");
  if (result.loading) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={result.reload} />;
  const found = (result.data || []).filter((c) => fold(`${c.title} ${c.tutor_name} ${c.students || ""}`).includes(fold(q)));
  const pick = (c: Row, v: string) => !v || (v === "disputes" ? c.disputes > 0 : v === "active" ? c.upcoming > 0 : c.upcoming === 0);
  const rows = found.filter((c) => pick(c, show));
  return (
    <div className="admin-pane">
      <AdminToolbar>
        <AdminSearch value={q} onChange={setQ} placeholder="Tìm lớp, gia sư hoặc học sinh…" />
        <FilterChips label="Trạng thái lớp" value={show} onChange={setShow} options={[["", "Tất cả"], ["active", "Còn buổi sắp tới"], ["done", "Hết buổi"], ["disputes", "Có báo cáo"]].map(([value, label]) => ({ value, label, count: found.filter((c) => pick(c, value)).length }))} />
        <span className="admin-bar-gap" />
        <Button asChild variant="outline"><Link to="/schedule"><CalendarDays data-icon="inline-start" />{t("Lịch toàn hệ thống")}</Link></Button>
      </AdminToolbar>
      {rows.length ? (
        <table className="finance-table">
          <thead><tr><th>{t("Lớp")}</th><th>{t("Gia sư")}</th><th>{t("Học sinh")}</th><th>{t("Buổi tiếp theo")}</th><th className="num">{t("Buổi sắp tới")}</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} data-color={c.color}>
                <td><Link to={`/classes/${c.id}`} className="admin-class-link">{c.title}</Link>{c.disputes > 0 ? <small className="danger-text">{t("{n} báo cáo cần xử lý", { n: c.disputes })}</small> : c.status !== "active" && <small>{t("Đã kết thúc")}</small>}</td>
                <td><Link to={`/tutors/${c.tutor_id}`} className="text-link">{c.tutor_name}</Link></td>
                <td>{c.students || "—"}</td>
                <td>{c.next_at ? `${dayOf(c.next_at)} ${timeOf(c.next_at)}` : "—"}</td>
                <td className="num">{c.upcoming}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Blank title={t(found.length || q ? "Không có lớp phù hợp" : "Chưa có lớp học nào")} action={(q || show) ? <Button variant="outline" onClick={() => { setQ(""); setShow(""); }}>{t("Xóa bộ lọc")}</Button> : undefined} />}
    </div>
  );
}

const ROLE: Record<string, string> = { student: "Học sinh", tutor: "Gia sư", admin: "Quản trị viên" };
const STATUS: Record<string, string> = { active: "Đang hoạt động", suspended: "Tạm khóa", deleted: "Đã xóa", ended: "Đã kết thúc", pending: "Chờ trả lời", accepted: "Đã nhận", declined: "Đã từ chối", expired: "Hết hạn", withdrawn: "Đã rút" };
const KIND: Record<string, string> = {
  deposit: "Nạp tiền", offer_hold: "Tạm giữ cho đề nghị", offer_released: "Hoàn tiền đề nghị", withdrawal_requested: "Yêu cầu rút tiền",
  withdrawal_paid: "Đã chuyển khoản rút tiền", withdrawal_rejected: "Hoàn yêu cầu rút tiền", credits_purchased: "Mua credit", credits_added: "Cộng Xu",
  credits_spent: "Dùng Xu gửi đề nghị", credits_monthly: "Xu tháng mới", credits_refunded: "Hoàn Xu", admin_adjustment: "Điều chỉnh bởi quản trị viên",
  lesson_paid: "Thanh toán buổi học", lesson_payout: "Học phí đã nhận", lesson_refund: "Hoàn học phí",
};
type Overview = {
  user: { id: number; name: string; email: string; role: string; learner_type: string; status: string; created_at: string };
  wallet: { available: number; held: number; credits_free: number; credits_paid: number };
  entries: { id: number; kind: string; amount: number; credits: number; note: string; created_at: string }[];
  classes: { id: number; title: string; color: string; status: string }[];
  proposals: { id: number; status: string; total: number; sessions: number; student_name: string; tutor_name: string; created_at: string }[];
  family: { id: number; name: string }[];
  violations: number;
};

// Everything about one person on one screen: money, classes, offers, family.
export function AdminUserOverview({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const { t } = useI18n(), result = useLoad<Overview>(userId ? `/admin/users/${userId}/overview` : null), o = result.data;
  return (
    <Dialog open={!!userId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="tutor-review-dialog">
        <DialogHeader>
          <DialogTitle>{o?.user.name || t("Tổng quan tài khoản")}</DialogTitle>
          <DialogDescription>{o ? `${o.user.email} · ${t(o.user.learner_type === "parent" ? "Phụ huynh" : ROLE[o.user.role] || o.user.role)} · ${t(STATUS[o.user.status] || o.user.status)}` : ""}</DialogDescription>
        </DialogHeader>
        {result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : o && (
          <div className="admin-finance">
            <dl className="finance-totals">
              <div><dt>{t("Có thể dùng")}</dt><dd>{money(o.wallet.available)}</dd></div>
              <div><dt>{t("Tạm giữ")}</dt><dd>{money(o.wallet.held)}</dd></div>
              <div><dt>{t("Credit")}</dt><dd>{o.wallet.credits_free + o.wallet.credits_paid}</dd></div>
              <div><dt>{t("Vi phạm")}</dt><dd>{o.violations}</dd></div>
            </dl>
            <Adjust userId={o.user.id} onDone={result.reload} />
            <div className="actions">
              <Button asChild size="sm" variant="outline"><Link to={`/schedule?user=${o.user.id}`} onClick={onClose}>{t("Xem lịch")}</Link></Button>
              {o.user.role === "tutor" && <Button asChild size="sm" variant="outline"><Link to={`/tutors/${o.user.id}`} onClick={onClose}>{t("Hồ sơ công khai")}</Link></Button>}
            </div>
            <section><h2>{t("Lớp học")}</h2>{o.classes.length ? <ul className="family-classes">{o.classes.map((c) => <li key={c.id} data-color={c.color}><Link to={`/classes/${c.id}`} onClick={onClose}><strong>{c.title}</strong><span>{t(c.status === "active" ? "Đang hoạt động" : "Đã kết thúc")}</span></Link></li>)}</ul> : <p className="credential-empty">—</p>}</section>
            <section><h2>{t("Đề nghị")}</h2>
              <table className="finance-table"><tbody>{o.proposals.map((p) => <tr key={p.id}><td>{p.tutor_name} ← {p.student_name}<small>{dateTime(p.created_at)}</small></td><td>{t(STATUS[p.status] || p.status)}</td><td className="num">{money(p.total)}</td></tr>)}</tbody></table>
            </section>
            {o.family.length > 0 && <section><h2>{t("Gia đình")}</h2><p>{o.family.map((f) => f.name).join(", ")}</p></section>}
            <section><h2>{t("Lịch sử")}</h2>
              <table className="finance-table"><tbody>{o.entries.map((e) => <tr key={e.id}><td>{t(KIND[e.kind] || e.kind)}<small>{dateTime(e.created_at)}</small></td><td>{e.note}</td><td className="num">{e.amount ? money(e.amount) : e.credits ? `${e.credits} credit` : ""}</td></tr>)}</tbody></table>
            </section>
            <AdminAuditTrail targetUser={userId} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Adds to or takes from a balance by hand (a bank transfer outside SePay, a goodwill refund).
// Every change is a ledger row with its reason; a balance never goes below zero.
function Adjust({ userId, onDone }: { userId: number; onDone: () => void }) {
  const { t } = useI18n(), [amount, setAmount] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const n = Math.trunc(Number(amount.replace(/[^\d-]/g, "")));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!n) return;
    if (!confirm(t(n > 0 ? "Cộng {amount} vào số dư?" : "Trừ {amount} khỏi số dư?", { amount: money(Math.abs(n)) }))) return;
    setBusy(true);
    try {
      await api(`/admin/wallets/${userId}/adjust`, "POST", { amount: n, note });
      toast.success(t("Đã điều chỉnh số dư"));
      setAmount(""); setNote(""); onDone();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <form className="wallet-adjust" onSubmit={save}>
      <Field><FieldLabel htmlFor="adjust-amount">{t("Điều chỉnh số dư (VND, số âm để trừ)")}</FieldLabel><Input id="adjust-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="200000" required /></Field>
      <Field><FieldLabel htmlFor="adjust-note">{t("Lý do")}</FieldLabel><Input id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} minLength={3} maxLength={300} required /></Field>
      <Button type="submit" variant="outline" disabled={busy || !n || note.trim().length < 3}>{t(n < 0 ? "Trừ {amount}" : "Cộng {amount}", { amount: money(Math.abs(n) || 0) })}</Button>
    </form>
  );
}

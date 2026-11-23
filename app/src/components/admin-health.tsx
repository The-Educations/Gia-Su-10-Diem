import { useState } from "react";
import { api, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Link } from "react-router-dom";
import { Loading } from "./common";
import { Button } from "./ui/button";
import { toast } from "sonner";

export type Warn = { kind: string; n: number; to: string };

type Health = {
  payments: { bank_webhook: boolean; gateway: boolean; sandbox: boolean; simulated: boolean; last_received: string | null; last_event: { created_at: string; status: string } | null; rejected_24h: number; pending_deposits: number; unmatched: number; recon_v2: boolean; last_recheck: string | null };
  email: { pending: number; attempts: number; failed: { id: number; attempts: number; sending_until: number; email: string | null }[]; latest_error: { attempts: number; email: string | null } | null };
  calendar: { connections: number; errors: number; last_synced: number | null };
  data: { user_version: number | null; counts: Record<string, number>; commit: string; deployed_at: string };
  ledger: { ok: boolean; issues: number; wallet: { user_id: number; name: string | null; d_avail: number; d_held: number }[]; negatives: { user_id: number; available: number; held: number }[]; deposits: { id: number; code: string; received: number; ledger: number }[]; double_credits: { note: string; n: number }[]; withdrawals: { id: number; status: string; amount: number; held: number }[] };
  warnings: Warn[];
};

const fmt = (s: string | number | null | undefined) => s ? new Date(typeof s === "number" ? s : Date.parse(s.includes("T") || s.includes(" ") ? s.replace(" ", "T") + (/[zZ]|\+/.test(s) ? "" : "Z") : s)).toLocaleString("vi-VN") : "—";

export function warnText(w: Warn, t: (s: string, o?: Record<string, string | number>) => string) {
  if (w.kind === "payments") return t("Không có cấu hình thanh toán — nạp tiền đang mô phỏng.");
  if (w.kind === "webhook") return t("Có {n} lệnh nạp chờ nhưng webhook SePay chưa về trong 24h.", { n: w.n });
  if (w.kind === "unmatched") return t("{n} khoản tiền về chưa khớp mã.", { n: w.n });
  if (w.kind === "signature") return t("{n} webhook bị từ chối chữ ký trong 24h qua.", { n: w.n });
  if (w.kind === "email") return t("{n} email không gửi được sau nhiều lần thử.", { n: w.n });
  if (w.kind === "calendar") return t("{n} kết nối Google Calendar đang lỗi.", { n: w.n });
  if (w.kind === "ledger") return t("Sổ cái lệch {n} chỗ — mở Hệ thống để kiểm tra.", { n: w.n });
  return w.kind;
}

export default function AdminHealth() {
  const { t } = useI18n();
  const h = useLoad<Health>("/admin/health");
  const [busy, setBusy] = useState(0);
  if (h.loading || !h.data) return <Loading />;
  const d = h.data;
  const mode = d.payments.gateway ? t("Cổng thanh toán") : d.payments.bank_webhook ? t("Chuyển khoản VietQR") : t("Mô phỏng (không cấu hình)");
  const resend = async (id: number) => {
    setBusy(id);
    try { await api(`/admin/health/email/${id}/resend`, "POST"); toast.success(t("Đã đưa lại vào hàng đợi")); h.reload(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(0); }
  };
  const Row = ({ k, v, warn }: { k: string; v: unknown; warn?: boolean }) => (
    <p className="health-kv"><span>{k}</span><span className={warn ? "danger-text" : "muted"}>{String(v)}</span></p>
  );
  return (
    <div className="admin-pane">
      {!!d.warnings.length && (
        <div className="health-warnings">
          {d.warnings.map((w) => <p key={w.kind} role="alert">⚠ {warnText(w, t)}</p>)}
        </div>
      )}
      <h3 className="admin-section-title">{t("Thanh toán")}</h3>
      <div className="health-list">
        <Row k={t("Chế độ")} v={`${mode}${d.payments.sandbox ? " · sandbox" : ""}`} warn={d.payments.simulated} />
        <Row k={t("Secret SePay (chỉ có/không)")} v={`webhook:${d.payments.bank_webhook ? "✓" : "✗"} · gateway:${d.payments.gateway ? "✓" : "✗"} · api v2:${d.payments.recon_v2 ? "✓" : "✗"}`} />
        <Row k={t("Webhook nhận cuối")} v={fmt(d.payments.last_received)} />
        <Row k={t("Sự kiện cuối")} v={d.payments.last_event ? `${d.payments.last_event.status} · ${fmt(d.payments.last_event.created_at)}` : "—"} />
        <Row k={t("Từ chối chữ ký 24h")} v={d.payments.rejected_24h} warn={d.payments.rejected_24h > 0} />
        <Row k={t("Nạp đang chờ")} v={d.payments.pending_deposits} warn={d.payments.pending_deposits > 0} />
        <Row k={t("Tiền về chưa khớp")} v={d.payments.unmatched} warn={d.payments.unmatched > 0} />
        <Row k={t("Đối soát v2 lần cuối")} v={fmt(d.payments.last_recheck)} />
      </div>
      <h3 className="admin-section-title">{t("Email")}</h3>
      <div className="health-list">
        <Row k={t("Đang chờ gửi")} v={d.email.pending} warn={d.email.pending > 20} />
        <Row k={t("Tổng lần thử")} v={d.email.attempts} />
        <Row k={t("Lỗi gần nhất")} v={d.email.latest_error ? `${d.email.latest_error.email ?? "?"} · ${t("{n} lần thử", { n: d.email.latest_error.attempts })}` : "—"} />
        {d.email.failed.map((m) => (
          <p className="health-kv" key={m.id}>
            <span>{m.email || "?"} <small className="muted">{t("{n} lần thử", { n: m.attempts })}</small></span>
            <span><small className="danger-text">{t("hết lượt thử")}</small> <Button size="xs" variant="outline" disabled={busy === m.id} onClick={() => resend(m.id)}>{t("Gửi lại")}</Button></span>
          </p>
        ))}
      </div>
      <h3 className="admin-section-title">{t("Lịch Google")}</h3>
      <div className="health-list">
        <Row k={t("Kết nối")} v={d.calendar.connections} />
        <Row k={t("Đồng bộ cuối")} v={fmt(d.calendar.last_synced)} />
        <Row k={t("Đang lỗi")} v={d.calendar.errors} warn={d.calendar.errors > 0} />
      </div>
      <h3 className="admin-section-title">{t("Sổ cái")}</h3>
      <div className="health-list">
        <Row k={t("Trạng thái")} v={d.ledger.ok ? t("Khớp") : t("Lệch {n} chỗ", { n: d.ledger.issues })} warn={!d.ledger.ok} />
        {d.ledger.wallet.map((m) => (
          <p className="health-kv" key={`w${m.user_id}`}>
            <span><Link to={`/admin?tab=users`}>{m.name || `#${m.user_id}`}</Link></span>
            <span className="danger-text">{t("lệch")} {m.d_avail ? `${m.d_avail.toLocaleString("vi-VN")}đ` : ""}{m.d_held ? ` · giữ ${m.d_held.toLocaleString("vi-VN")}đ` : ""}</span>
          </p>
        ))}
        {d.ledger.deposits.map((m) => (
          <p className="health-kv" key={`d${m.id}`}>
            <span><Link to="/admin?tab=finance">{m.code}</Link></span>
            <span className="danger-text">{t("nhận")} {m.received.toLocaleString("vi-VN")}đ ≠ sổ {m.ledger.toLocaleString("vi-VN")}đ</span>
          </p>
        ))}
        {d.ledger.withdrawals.map((m) => (
          <p className="health-kv" key={`r${m.id}`}>
            <span><Link to="/admin?tab=finance">{t("Lệnh rút")} #{m.id} · {m.status}</Link></span>
            <span className="danger-text">{t("giữ")} {m.held.toLocaleString("vi-VN")}đ / {m.amount.toLocaleString("vi-VN")}đ</span>
          </p>
        ))}
        {d.ledger.double_credits.map((m) => (
          <p className="health-kv" key={`c${m.note}`}>
            <span><Link to="/admin?tab=finance">{m.note}</Link></span>
            <span className="danger-text">{t("cộng {n} lần", { n: m.n })}</span>
          </p>
        ))}
        {d.ledger.negatives.map((m) => (
          <p className="health-kv" key={`n${m.user_id}`}>
            <span><Link to="/admin?tab=users">#{m.user_id}</Link></span>
            <span className="danger-text">{t("số dư âm")} {Math.min(m.available, m.held).toLocaleString("vi-VN")}đ</span>
          </p>
        ))}
      </div>
      <h3 className="admin-section-title">{t("Dữ liệu")}</h3>
      <div className="health-list">
        <Row k={t("Phiên bản dữ liệu")} v={d.data.user_version ?? "—"} />
        <Row k={t("Bản ghi")} v={Object.entries(d.data.counts).map(([k, v]) => `${k}:${v}`).join(" · ")} />
        <Row k={t("Commit")} v={d.data.commit ? d.data.commit.slice(0, 10) : "—"} />
        <Row k={t("Thời điểm triển khai")} v={fmt(d.data.deployed_at)} />
      </div>
    </div>
  );
}

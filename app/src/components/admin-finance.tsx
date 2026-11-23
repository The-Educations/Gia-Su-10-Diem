import { useState } from "react";
import { toast } from "sonner";
import { api, dateTime, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ErrorState, Loading } from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";
import "@/money.css";

type Finance = {
  withdrawals: { id: number; name: string; amount: number; bank_name: string; account_number: string; account_name: string; status: string; note: string; created_at: string }[];
  deposits: { id: number; name: string; code: string; amount: number; received: number; status: string; created_at: string }[];
  unmatched: { id: number; code: string | null; amount: number; reference: string; created_at: string }[];
  totals: { deposited: number; balances: number; credit_revenue: number; fee_revenue: number };
  settings: Record<string, number | { credits: number; price: number }[]>;
  payments: "live" | "simulated" | "off";
};
const SETTINGS: [string, string][] = [
  ["fee_percent", "Phí nền tảng (%)"],
  ["monthly_credits", "Credit miễn phí mỗi tháng"],
  ["offer_credits", "Credit cho mỗi offer"],
  ["offer_hours", "Offer hết hạn sau (giờ)"],
  ["confirm_hours", "Tự xác nhận buổi học sau (giờ)"],
  ["cancel_hours", "Hủy không mất phí trước (giờ)"],
  ["min_deposit", "Nạp tối thiểu (VND)"],
];

export function AdminFinance() {
  const { t } = useI18n(),
    { refresh } = useApp(),
    result = useLoad<Finance>("/admin/finance"),
    [busy, setBusy] = useState(0);
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  const f = result.data;
  async function settle(id: number, status: "paid" | "rejected") {
    const note = status === "rejected" ? prompt(t("Lý do từ chối")) || "" : "";
    if (status === "rejected" && !note) return;
    setBusy(id);
    try { await api(`/admin/withdrawals/${id}`, "PATCH", { status, note }); refresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(0); }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api("/admin/settings", "PUT", Object.fromEntries(SETTINGS.map(([k]) => [k, Number(form.get(k))])));
      toast.success(t("Đã lưu cài đặt"));
      refresh();
    } catch (err) { toast.error((err as Error).message); }
  }
  return (
    <div className="admin-finance">
      <div className="actions">
        <Button variant="outline" disabled={busy === -1} onClick={async () => {
          setBusy(-1);
          try { const r = await api<{ checked: number; paid: number }>("/admin/deposits/recheck", "POST"); toast.success(t("Đã kiểm tra {checked} lệnh nạp, cộng {paid} lệnh", r)); refresh(); }
          catch (e) { toast.error((e as Error).message); } finally { setBusy(0); }
        }}>{t("Kiểm tra lại với SePay")}</Button>
      </div>
      <p className="finance-status" data-state={f.payments}>{t(f.payments === "live" ? "Thanh toán SePay đang chạy" : f.payments === "simulated" ? "Đang giả lập nạp tiền (môi trường local)" : "Nạp tiền đang tắt: chưa có khóa SePay")}</p>
      <dl className="finance-totals">
        <div><dt>{t("Đã nạp")}</dt><dd>{money(f.totals.deposited)}</dd></div>
        <div><dt>{t("Đang giữ trong số dư")}</dt><dd>{money(f.totals.balances)}</dd></div>
        <div><dt>{t("Doanh thu credit")}</dt><dd>{money(f.totals.credit_revenue)}</dd></div>
        <div><dt>{t("Doanh thu phí")}</dt><dd>{money(f.totals.fee_revenue)}</dd></div>
      </dl>
      <section>
        <h2>{t("Yêu cầu rút tiền")}</h2>
        {f.withdrawals.length ? (
          <table className="finance-table">
            <thead><tr><th>{t("Người yêu cầu")}</th><th>{t("Tài khoản nhận")}</th><th className="num">{t("Số tiền")}</th><th>{t("Trạng thái")}</th></tr></thead>
            <tbody>
              {f.withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{w.name}<small>{dateTime(w.created_at)}</small></td>
                  <td>{w.bank_name} · {w.account_number}<small>{w.account_name}</small></td>
                  <td className="num">{money(w.amount)}</td>
                  <td>
                    {w.status === "requested" ? (
                      <span className="actions">
                        <Button size="sm" disabled={busy === w.id} onClick={() => settle(w.id, "paid")}>{t("Đã chuyển")}</Button>
                        <Button size="sm" variant="ghost" disabled={busy === w.id} onClick={() => settle(w.id, "rejected")}>{t("Từ chối")}</Button>
                      </span>
                    ) : t(w.status === "paid" ? "Đã chuyển" : "Đã từ chối")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="credential-empty">{t("Chưa có yêu cầu rút tiền.")}</p>}
      </section>
      {f.unmatched.length > 0 && (
        <section>
          <h2>{t("Tiền về chưa khớp mã")}</h2>
          <table className="finance-table">
            <tbody>{f.unmatched.map((u) => <tr key={u.id}><td>#{u.id}<small>{dateTime(u.created_at)}</small></td><td>{u.code || t("Không có mã")}<small>{u.reference}</small></td><td className="num">{money(u.amount)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      <section>
        <h2>{t("Lệnh nạp gần đây")}</h2>
        <table className="finance-table">
          <tbody>{f.deposits.slice(0, 30).map((d) => <tr key={d.id}><td>{d.name}<small>{dateTime(d.created_at)}</small></td><td>{d.code}</td><td className="num">{money(d.received || d.amount)}</td><td>{t(d.status === "paid" ? "Đã nhận" : "Chờ chuyển khoản")}</td></tr>)}</tbody>
        </table>
      </section>
      <section>
        <h2>{t("Cài đặt kinh doanh")}</h2>
        <form className="finance-settings" onSubmit={save}>
          {SETTINGS.map(([key, label]) => (
            <Field key={key}><FieldLabel htmlFor={`s-${key}`}>{t(label)}</FieldLabel><Input id={`s-${key}`} name={key} type="number" step="any" defaultValue={String(f.settings[key])} required /></Field>
          ))}
          <div className="actions"><Button type="submit">{t("Lưu cài đặt")}</Button></div>
        </form>
      </section>
    </div>
  );
}

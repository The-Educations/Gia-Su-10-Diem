import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleCheck, Copy, ImagePlus, Landmark, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, dateTime, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ErrorState, Loading } from "./common";
import { Waiting } from "./admin-kit";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import "@/money.css";

type Finance = {
  withdrawals: Payout[];
  months: { month: string; deposits: number; payouts: number; payouts_confirmed: number; fees: number; credits: number }[];
  payout_check: boolean;
  deposits: { id: number; name: string; email: string; payer_name: string; payer_email: string; user_id: number; payer_id: number; code: string; amount: number; received: number; status: string; created_at: string; paid_at: string | null; method: string | null }[];
  unmatched: { id: number; code: string | null; amount: number; reference: string; created_at: string }[];
  totals: { deposited: number; balances: number; credit_revenue: number; fee_revenue: number };
  settings: Record<string, number | { credits: number; price: number }[]>;
  payments: "live" | "simulated" | "off";
};
type Payout = {
  id: number; user_id: number; name: string; email: string; role: string; amount: number; bank_name: string; account_number: string; account_name: string;
  status: string; note: string; created_at: string; handled_at: string | null; code: string | null; bank_ref: string; paid_via: string;
  thread_id: number | null; receipt_url: string | null; qr_url: string | null;
};
type Pack = { credits: number; price: number };
const SECTIONS = [["payouts", "Chuyển tiền"], ["report", "Báo cáo"], ["deposits", "Nạp tiền"], ["settings", "Cài đặt"]] as const;
type Section = (typeof SECTIONS)[number][0];
// [key, label, step, min, max]: the same limits the server checks in PUT /api/admin/settings.
const GROUPS: [string, [string, string, number, number, number][]][] = [
  ["Phí và nạp tiền", [["fee_percent", "Phí nền tảng (%)", 0.5, 0, 50], ["min_deposit", "Nạp tối thiểu (VND)", 1000, 10000, 10000000]]],
  ["Xu gia sư", [["monthly_credits", "Xu miễn phí mỗi tháng", 1, 0, 100], ["offer_credits", "Xu cho mỗi đề nghị", 1, 0, 20]]],
  ["Thời hạn", [["offer_hours", "Đề nghị hết hạn sau (giờ)", 1, 1, 336], ["confirm_hours", "Tự xác nhận buổi học sau (giờ)", 1, 1, 336], ["cancel_hours", "Hủy không mất phí trước (giờ)", 1, 0, 168]]],
];
const KEYS = GROUPS.flatMap(([, fields]) => fields.map(([key]) => key));

export function AdminFinance() {
  const { t } = useI18n(),
    { refresh } = useApp(),
    [params, setParams] = useSearchParams(),
    result = useLoad<Finance>("/admin/finance"),
    [busy, setBusy] = useState(0),
    [paying, setPaying] = useState<Payout | null>(null);
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  const f = result.data, open = f.withdrawals.filter((w) => w.status === "requested"), done = f.withdrawals.filter((w) => w.status !== "requested");
  const fin: Section = SECTIONS.find(([k]) => k === params.get("fin"))?.[0] || "payouts";
  const counts: Partial<Record<Section, number>> = { payouts: open.length, deposits: f.unmatched.length };
  function go(k: Section) {
    setParams((p) => { const q = new URLSearchParams(p); q.set("tab", "finance"); q.set("fin", k); return q; });
  }
  async function reject(id: number) {
    const note = prompt(t("Lý do từ chối")) || "";
    if (!note) return;
    setBusy(id);
    try { await api(`/admin/withdrawals/${id}`, "PATCH", { status: "rejected", note }); refresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(0); }
  }
  return (
    <div className="admin-finance">
      <p className="finance-status" data-state={f.payments}>{t(f.payments === "live" ? "Thanh toán SePay đang chạy" : f.payments === "simulated" ? "Đang giả lập nạp tiền (môi trường local)" : "Nạp tiền đang tắt: chưa có khóa SePay")}</p>
      <nav className="admin-sections" aria-label={t("Mục tài chính")}>
        {SECTIONS.map(([k, label]) => (
          <a key={k} href={`?tab=finance&fin=${k}`} aria-current={fin === k ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(k); }}>
            {t(label)}<Waiting n={counts[k]} />
          </a>
        ))}
      </nav>
      {fin === "payouts" && (
        <>
          <section>
            <h2>{t("Cần chuyển tiền")}</h2>
            <p className="finance-status" data-state={f.payout_check ? "live" : "off"}>{t(f.payout_check ? "SePay tự xác nhận khi tiền rời tài khoản ngân hàng với đúng mã lệnh" : "Chưa bật tự xác nhận qua SePay: bấm “Đã chuyển” sau khi chuyển khoản")}</p>
            {open.length ? <div className="payout-queue">{open.map((w) => <PayoutCard key={w.id} w={w} busy={busy === w.id} onPaid={() => setPaying(w)} onReject={() => reject(w.id)} />)}</div>
              : <p className="credential-empty">{t("Không có yêu cầu nào đang chờ.")}</p>}
          </section>
          {done.length > 0 && (
            <section>
              <h2>{t("Đã xử lý")}</h2>
              <table className="finance-table">
                <thead><tr><th>{t("Người yêu cầu")}</th><th>{t("Tài khoản nhận")}</th><th>{t("Trạng thái")}</th><th className="num">{t("Số tiền")}</th></tr></thead>
                <tbody>
                  {done.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name}<small>{w.code} · {dateTime(w.handled_at || w.created_at)}</small></td>
                      <td>{w.bank_name} · {w.account_number}<small>{w.account_name}</small></td>
                      <td>
                        <span className="withdraw-state" data-state={w.status}>{t(w.status === "paid" ? "Đã chuyển" : "Đã từ chối")}</span>
                        {w.bank_ref && <small className="bank-ok"><CircleCheck aria-hidden="true" />{t("Ngân hàng xác nhận")}</small>}
                        {w.status === "rejected" && w.note && <small>{w.note}</small>}
                        {w.status === "paid" && (w.receipt_url
                          ? <a className="text-link" href={w.receipt_url} target="_blank" rel="noreferrer">{t("Xem biên lai")}</a>
                          : <Button size="xs" variant="ghost" onClick={() => setPaying(w)}><ImagePlus data-icon="inline-start" />{t("Thêm biên lai")}</Button>)}
                      </td>
                      <td className="num">{money(w.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
      {fin === "report" && <MonthReport months={f.months} balances={f.totals.balances} />}
      {fin === "deposits" && (
        <>
          {f.unmatched.length > 0 && (
            <section>
              <h2>{t("Tiền về chưa khớp mã")}</h2>
              <table className="finance-table">
                <tbody>{f.unmatched.map((u) => <tr key={u.id}><td>#{u.id}<small>{dateTime(u.created_at)}</small></td><td>{u.code || t("Không có mã")}<small>{u.reference}</small></td><td className="num">{money(u.amount)}</td></tr>)}</tbody>
              </table>
            </section>
          )}
          <section>
            <header className="finance-head">
              <h2>{t("Nạp tiền thành công")}</h2>
              <Button size="sm" variant="outline" disabled={busy === -1} onClick={async () => {
                setBusy(-1);
                try { const r = await api<{ checked: number; paid: number }>("/admin/deposits/recheck", "POST"); toast.success(t("Đã kiểm tra {checked} lệnh nạp, cộng {paid} lệnh", r)); refresh(); }
                catch (e) { toast.error((e as Error).message); } finally { setBusy(0); }
              }}>{t("Kiểm tra lại với SePay")}</Button>
            </header>
            {f.deposits.length ? (
              <table className="finance-table">
                <thead><tr><th>{t("Người nạp → tài khoản nhận")}</th><th>{t("Mã lệnh")}</th><th>{t("Cách thanh toán")}</th><th className="num">{t("Số tiền")}</th></tr></thead>
                <tbody>{f.deposits.map((d) => (
                  <tr key={d.id}>
                    <td>{d.payer_name}{d.payer_id !== d.user_id && <> → {d.name}</>}<small>{d.payer_email} · {dateTime(d.paid_at || d.created_at)}</small></td>
                    <td>{d.code}</td>
                    <td>{t(/BANK_TRANSFER/.test(d.method || "") ? "Chuyển khoản" : /CARD/.test(d.method || "") ? "Thẻ" : /NAPAS/.test(d.method || "") ? "NAPAS" : /simulated/.test(d.method || "") ? "Giả lập" : "SePay")}</td>
                    <td className="num">{money(d.received || d.amount)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="credential-empty">{t("Chưa có lệnh nạp nào thành công.")}</p>}
          </section>
        </>
      )}
      {fin === "settings" && <SettingsForm key={JSON.stringify(f.settings)} settings={f.settings} onSaved={refresh} />}
      <PayoutDialog w={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); refresh(); }} />
    </div>
  );
}

// Business numbers in three groups plus the Xu packs tutors can buy, saved together in one request.
function SettingsForm({ settings, onSaved }: { settings: Finance["settings"]; onSaved: () => void }) {
  const { t } = useI18n();
  const initial = useMemo(() => ({
    values: Object.fromEntries(KEYS.map((k) => [k, String(settings[k] ?? "")])),
    packs: ((settings.credit_packs as Pack[]) || []).map((p) => ({ credits: String(p.credits), price: String(p.price) })),
  }), [settings]);
  const [values, setValues] = useState(initial.values),
    [packs, setPacks] = useState(initial.packs),
    [busy, setBusy] = useState(false);
  const payload = (v: typeof values, p: typeof packs) => ({
    ...Object.fromEntries(KEYS.map((k) => [k, Number(v[k])])),
    credit_packs: p.map((x) => ({ credits: Number(x.credits), price: Number(x.price) })),
  });
  const body = payload(values, packs), dirty = JSON.stringify(body) !== JSON.stringify(payload(initial.values, initial.packs));
  const dupes = new Set(body.credit_packs.map((p) => p.credits).filter((n, i, a) => n > 0 && a.indexOf(n) !== i));
  const setPack = (i: number, key: "credits" | "price", v: string) => setPacks((list) => list.map((p, j) => (j === i ? { ...p, [key]: v } : p)));
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty || dupes.size) return;
    setBusy(true);
    try {
      await api("/admin/settings", "PUT", body);
      toast.success(t("Đã lưu cài đặt"));
      onSaved();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <form className="finance-settings" onSubmit={save}>
      {GROUPS.map(([legend, fields]) => (
        <FieldSet key={legend}>
          <FieldLegend>{t(legend)}</FieldLegend>
          <div className="finance-fields">
            {fields.map(([key, label, step, min, max]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`s-${key}`}>{t(label)}</FieldLabel>
                <Input id={`s-${key}`} name={key} type="number" inputMode="decimal" min={min} max={max} step={step} value={values[key]} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} required />
              </Field>
            ))}
          </div>
        </FieldSet>
      ))}
      <FieldSet>
        <FieldLegend>{t("Gói Xu")}</FieldLegend>
        <ul className="pack-list">
          {packs.map((p, i) => {
            const credits = Number(p.credits), price = Number(p.price);
            return (
              <li key={i} className="pack-row">
                <label className="pack-input">
                  <Input type="number" inputMode="numeric" min={1} step={1} required value={p.credits} aria-label={t("Số Xu của gói {n}", { n: i + 1 })} aria-invalid={dupes.has(credits) || undefined} onChange={(e) => setPack(i, "credits", e.target.value)} />
                  <span>{t("Xu")}</span>
                </label>
                <label className="pack-input">
                  <Input type="number" inputMode="numeric" min={1000} step={1000} required value={p.price} aria-label={t("Giá gói {n} (VND)", { n: i + 1 })} onChange={(e) => setPack(i, "price", e.target.value)} />
                  <span>₫</span>
                </label>
                <span className="pack-unit">{credits > 0 && price > 0 ? t("{price}/Xu", { price: money(Math.round(price / credits)) }) : "—"}</span>
                <Button type="button" size="icon" variant="ghost" disabled={packs.length <= 1} aria-label={t("Xóa gói {n}", { n: i + 1 })} onClick={() => setPacks((list) => list.filter((_, j) => j !== i))}><Trash2 /></Button>
              </li>
            );
          })}
        </ul>
        {dupes.size > 0 && <p className="pack-error" role="alert">{t("Mỗi gói cần số Xu khác nhau.")}</p>}
        {packs.length < 6 && (
          <Button type="button" size="sm" variant="outline" className="pack-add" onClick={() => setPacks((list) => [...list, { credits: "", price: "" }])}><Plus data-icon="inline-start" />{t("Thêm gói")}</Button>
        )}
      </FieldSet>
      <div className="finance-save">
        <Button type="submit" disabled={!dirty || dupes.size > 0 || busy}>{t("Lưu cài đặt")}</Button>
        <Button type="button" variant="ghost" disabled={!dirty || busy} onClick={() => { setValues(initial.values); setPacks(initial.packs); }}>{t("Hoàn tác")}</Button>
      </div>
    </form>
  );
}

const copy = (text: string, t: (s: string) => string) => navigator.clipboard?.writeText(text).then(() => toast.success(t("Đã chép")));

// One payout to make: scan the QR with the bank app (account, amount and memo are filled in).
function PayoutCard({ w, busy, onPaid, onReject }: { w: Payout; busy: boolean; onPaid: () => void; onReject: () => void }) {
  const { t } = useI18n();
  return (
    <article className="payout-card">
      {w.qr_url ? <img src={w.qr_url} alt={t("Mã QR chuyển {amount} cho {name}", { amount: money(w.amount), name: w.account_name })} /> : <span className="payout-noqr"><Landmark aria-hidden="true" /></span>}
      <div className="payout-body">
        <strong className="payout-amount">{money(w.amount)}</strong>
        <span>{w.name} · {t(w.role === "tutor" ? "Gia sư" : "Học sinh")}<small>{dateTime(w.created_at)}</small></span>
        <dl>
          <div><dt>{t("Ngân hàng")}</dt><dd>{w.bank_name}</dd></div>
          <div><dt>{t("Số tài khoản")}</dt><dd>{w.account_number}<button type="button" aria-label={t("Chép số tài khoản")} onClick={() => copy(w.account_number, t)}><Copy /></button></dd></div>
          <div><dt>{t("Chủ tài khoản")}</dt><dd>{w.account_name}</dd></div>
          {w.code && <div><dt>{t("Nội dung")}</dt><dd className="deposit-code">{w.code}<button type="button" aria-label={t("Chép nội dung")} onClick={() => copy(w.code!, t)}><Copy /></button></dd></div>}
        </dl>
        <div className="actions">
          <Button size="sm" disabled={busy} onClick={onPaid}><Receipt data-icon="inline-start" />{t("Đã chuyển")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>{t("Từ chối")}</Button>
        </div>
      </div>
    </article>
  );
}

// Marks a payout as sent, with the bank's receipt image for the user (optional), or adds the receipt later.
function PayoutDialog({ w, onClose, onDone }: { w: Payout | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n(),
    [file, setFile] = useState<File | null>(null),
    [over, setOver] = useState(false),
    [busy, setBusy] = useState(false),
    input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const later = w?.status === "paid";
  function pick(f?: File | null) { if (f && /^image\/(png|jpe?g|webp)$/.test(f.type)) setFile(f); else if (f) toast.error(t("Chọn ảnh JPG, PNG hoặc WebP.")); }
  async function confirm() {
    if (!w) return;
    setBusy(true);
    try {
      let receipt_id: string | undefined;
      if (file) {
        const r = await fetch(`/api/chat/support/${w.thread_id}/attachments`, { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file, credentials: "same-origin" });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t("Không tải được ảnh."));
        receipt_id = (await r.json()).id;
      }
      if (later) await api(`/admin/withdrawals/${w.id}/receipt`, "POST", { receipt_id });
      else await api(`/admin/withdrawals/${w.id}`, "PATCH", { status: "paid", receipt_id });
      toast.success(t(later ? "Đã gửi biên lai" : "Đã ghi nhận chuyển tiền"));
      setFile(null);
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={!!w} onOpenChange={(v) => { if (!v && !busy) { setFile(null); onClose(); } }}>
      <DialogContent className="topup-dialog">
        <DialogHeader>
          <DialogTitle>{t(later ? "Thêm biên lai" : "Xác nhận đã chuyển")}</DialogTitle>
          <DialogDescription>{w && t("{amount} cho {name}", { amount: money(w.amount), name: w.account_name })}</DialogDescription>
        </DialogHeader>
        <button type="button" className="receipt-drop" data-over={over || undefined} data-filled={!!file || undefined}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
          {file ? <img src={preview} alt={t("Biên lai đã chọn")} /> : <><ImagePlus aria-hidden="true" /><span>{t("Kéo ảnh biên lai vào đây hoặc bấm để chọn")}</span></>}
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div className="topup-actions">
          <Button size="lg" disabled={busy || (later && !file)} onClick={confirm}>{t(later ? "Gửi biên lai" : file ? "Xác nhận và gửi biên lai" : "Xác nhận đã chuyển")}</Button>
          {file && <Button variant="ghost" disabled={busy} onClick={() => setFile(null)}>{t("Bỏ ảnh")}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Six months of money in, money out and revenue, drawn as bars with the figures beside them.
function MonthReport({ months, balances }: { months: Finance["months"]; balances: number }) {
  const { t } = useI18n();
  const now = months.at(-1)!, revenue = (m: Finance["months"][number]) => m.fees + m.credits;
  const max = Math.max(1, ...months.flatMap((m) => [m.deposits, m.payouts, revenue(m)]));
  const label = (m: string) => t("T{n}", { n: Number(m.slice(5)) });
  return (
    <section className="month-report">
      <h2>{t("Tháng {month}", { month: `${Number(now.month.slice(5))}/${now.month.slice(0, 4)}` })}</h2>
      <dl className="finance-totals">
        <div><dt>{t("Tiền nạp vào")}</dt><dd>{money(now.deposits)}</dd></div>
        <div><dt>{t("Tiền đã rút ra")}</dt><dd>{money(now.payouts)}</dd>{now.payouts > 0 && <small>{t("Ngân hàng xác nhận {amount}", { amount: money(now.payouts_confirmed) })}</small>}</div>
        <div><dt>{t("Doanh thu")}</dt><dd>{money(revenue(now))}</dd><small>{t("Phí {fees} · Xu {credits}", { fees: money(now.fees), credits: money(now.credits) })}</small></div>
        <div><dt>{t("Người dùng đang giữ")}</dt><dd>{money(balances)}</dd></div>
      </dl>
      <figure className="month-chart">
        <div className="month-bars" role="img" aria-label={t("Biểu đồ 6 tháng: tiền nạp, tiền rút và doanh thu")}>
          {months.map((m) => (
            <div key={m.month} className="month-col">
              <div className="month-stack">
                <span data-kind="in" style={{ height: `${(m.deposits / max) * 100}%` }} />
                <span data-kind="out" style={{ height: `${(m.payouts / max) * 100}%` }} />
                <span data-kind="rev" style={{ height: `${(revenue(m) / max) * 100}%` }} />
              </div>
              <small>{label(m.month)}</small>
            </div>
          ))}
        </div>
        <figcaption className="month-legend"><span data-kind="in">{t("Tiền nạp")}</span><span data-kind="out">{t("Tiền rút")}</span><span data-kind="rev">{t("Doanh thu")}</span></figcaption>
      </figure>
      <table className="finance-table month-table">
        <thead><tr><th>{t("Tháng")}</th><th className="num">{t("Tiền nạp")}</th><th className="num">{t("Tiền rút")}</th><th className="num">{t("Doanh thu")}</th></tr></thead>
        <tbody>{[...months].reverse().map((m) => <tr key={m.month}><td>{`${Number(m.month.slice(5))}/${m.month.slice(0, 4)}`}</td><td className="num">{money(m.deposits)}</td><td className="num">{money(m.payouts)}</td><td className="num">{money(revenue(m))}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

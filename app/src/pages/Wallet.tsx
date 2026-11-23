import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, CircleCheck, Coins, Copy, ExternalLink, Landmark, LoaderCircle, Wallet as WalletIcon } from "lucide-react";
import { renderSVG } from "uqr";
import { toast } from "sonner";
import { api, dateTime, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { celebrate } from "@/lib/celebrate";
import type { Deposit, Wallet } from "@/lib/types";
import { ErrorState, Heading, Loading, Page, Submit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "@/money.css";

const PRESETS = [200000, 500000, 1000000, 2000000];
const KIND: Record<string, string> = {
  deposit: "Nạp tiền",
  offer_hold: "Tạm giữ cho offer",
  offer_released: "Hoàn tiền offer",
  withdrawal_requested: "Yêu cầu rút tiền",
  withdrawal_paid: "Đã chuyển khoản rút tiền",
  withdrawal_rejected: "Hoàn yêu cầu rút tiền",
  credits_purchased: "Mua credit",
  credits_added: "Cộng credit",
  credits_spent: "Dùng credit gửi offer",
  credits_monthly: "Credit tháng mới",
  admin_adjustment: "Điều chỉnh bởi quản trị viên",
  platform_fee: "Phí nền tảng",
  lesson_payout: "Học phí đã nhận",
  lesson_refund: "Hoàn học phí",
};

function payOnSepay(checkout: NonNullable<Deposit["checkout"]>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.action;
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}

// Back from SePay: the balance updates when SePay's notice arrives, usually within seconds.
function ReturnedFromSepay({ id, result, onPaid }: { id: number; result: string; onPaid: () => void }) {
  const { t } = useI18n(), [d, setD] = useState<Deposit | null>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const next = await api<Deposit>(`/wallet/deposits/${id}`);
        if (stop) return;
        setD(next);
        if (next.status === "paid") { celebrate(box.current); onPaid(); return; }
      } catch { /* keep waiting */ }
      if (!stop && result === "success") setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; };
  }, [id]);
  const paid = d?.status === "paid";
  return (
    <div className="sepay-return" ref={box} role="status" data-state={paid ? "paid" : result}>
      {paid ? <CircleCheck aria-hidden="true" /> : result === "success" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      <span>{t(paid ? "Đã nhận {amount} vào số dư" : result === "success" ? "Đang chờ SePay xác nhận thanh toán…" : result === "cancel" ? "Bạn đã hủy thanh toán. Số dư chưa thay đổi." : "Thanh toán chưa thành công. Bạn có thể thử lại.", { amount: money(d?.received || 0) })}</span>
    </div>
  );
}

const digits = (v: string) => Number(v.replace(/\D/g, "").slice(0, 9)) || 0;
const grouped = (n: number) => (n ? n.toLocaleString("vi-VN") : "");

// A big amount field with presets underneath; the number is typed with thousands separators.
function AmountField({ id, label, value, onChange, presets, hint }: { id: string; label: string; value: number; onChange: (n: number) => void; presets: { label: string; value: number }[]; hint?: string }) {
  const { t } = useI18n();
  return (
    <div className="amount-field">
      <label htmlFor={id}>{label}</label>
      <div className="amount-input">
        <input id={id} inputMode="numeric" autoComplete="off" value={grouped(value)} onChange={(e) => onChange(digits(e.target.value))} aria-describedby={hint ? `${id}-hint` : undefined} />
        <span aria-hidden="true">₫</span>
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      <div className="chip-set" role="group" aria-label={t("Số tiền gợi ý")}>
        {presets.map((p) => <button type="button" key={p.label} className="chip" data-checked={value === p.value || undefined} aria-pressed={value === p.value} onClick={() => onChange(p.value)}>{p.label}</button>)}
      </div>
    </div>
  );
}

function PayQr({ deposit }: { deposit: Deposit }) {
  const { t } = useI18n();
  const svg = useMemo(() => (!deposit.qr_url && deposit.pay_url ? renderSVG(deposit.pay_url, { border: 1, blackColor: "#282820", whiteColor: "#fffefa" }) : ""), [deposit.pay_url, deposit.qr_url]);
  const label = t("Mã QR của lệnh {code}", { code: deposit.code });
  if (deposit.qr_url) return <figure className="topup-qr-wrap"><img className="topup-qr" src={deposit.qr_url} alt={label} /><figcaption>{t("Quét bằng ứng dụng ngân hàng")}</figcaption></figure>;
  if (svg) return <figure className="topup-qr-wrap" data-kind="link"><div className="topup-qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} /><figcaption>{t("Quét bằng điện thoại để thanh toán")}</figcaption></figure>;
  return <div className="topup-qr placeholder"><Landmark aria-hidden="true" /></div>;
}

// Every opening is a new order with its own code and QR; unpaid ones are left as they are.
function DepositDialog({ open, onOpenChange, min, onPaid, forStudent }: { open: boolean; onOpenChange: (v: boolean) => void; min: number; onPaid: () => void; forStudent?: number }) {
  const { t } = useI18n(),
    [amount, setAmount] = useState(500000),
    [deposit, setDeposit] = useState<Deposit | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    done = useRef<HTMLDivElement>(null);
  // The page learns "paid" from our own server, polled every 3 s while visible.
  useEffect(() => {
    if (!deposit || deposit.status === "paid") return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      api<Deposit>(`/wallet/deposits/${deposit.id}`).then((d) => setDeposit((cur) => (cur ? { ...cur, ...d, simulated: cur.simulated } : d))).catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [deposit?.id, deposit?.status]);
  useEffect(() => {
    if (deposit?.status === "paid") {
      celebrate(done.current);
      onPaid();
    }
  }, [deposit?.status]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (amount < min) return setError(t("Số tiền nạp tối thiểu là {amount}.", { amount: money(min) }));
    setBusy(true);
    setError("");
    try { setDeposit(await api<Deposit>("/wallet/deposits", "POST", { amount, ...(forStudent ? { student_id: forStudent } : {}) })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success(t("Đã chép")));
  const close = (v: boolean) => { onOpenChange(v); if (!v) { setDeposit(null); setError(""); } };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="topup-dialog">
        <DialogHeader>
          <DialogTitle>{t(forStudent ? "Nạp tiền cho con" : "Nạp tiền")}</DialogTitle>
          <DialogDescription className="sr-only">{t("Chọn số tiền rồi thanh toán bằng mã QR hoặc trên trang SePay.")}</DialogDescription>
        </DialogHeader>
        {!deposit ? (
          <form onSubmit={create} className="topup-step">
            <AmountField id="deposit-amount" label={t("Số tiền nạp")} value={amount} onChange={setAmount} hint={t("Tối thiểu {amount}", { amount: money(min) })}
              presets={PRESETS.map((p) => ({ label: money(p), value: p }))} />
            {error && <ErrorState error={error} />}
            <Submit busy={busy}>{t("Tạo lệnh nạp {amount}", { amount: money(amount) })}</Submit>
          </form>
        ) : deposit.status === "paid" ? (
          <div className="deposit-done" ref={done} role="status">
            <CircleCheck aria-hidden="true" />
            <strong>{t("Đã nhận {amount}", { amount: money(deposit.received) })}</strong>
            <Button onClick={() => close(false)}>{t("Xong")}</Button>
          </div>
        ) : (
          <div className="topup-pay">
            <div className="topup-sum">
              <strong>{money(deposit.amount)}</strong>
              <span>{t("Mã lệnh")} <b className="deposit-code">{deposit.code}</b><button type="button" aria-label={t("Chép mã lệnh")} onClick={() => copy(deposit.code)}><Copy /></button></span>
            </div>
            <PayQr deposit={deposit} />
            <p className="topup-wait" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />{t("Đang chờ thanh toán")}</p>
            {deposit.account && (
              <dl className="topup-bank">
                <div><dt>{t("Số tài khoản")}</dt><dd>{deposit.account} · {deposit.bank}<button type="button" aria-label={t("Chép số tài khoản")} onClick={() => copy(deposit.account)}><Copy /></button></dd></div>
                {deposit.holder && <div><dt>{t("Chủ tài khoản")}</dt><dd>{deposit.holder}</dd></div>}
                <div><dt>{t("Nội dung chuyển khoản")}</dt><dd>{deposit.code}</dd></div>
              </dl>
            )}
            <div className="topup-actions">
              {deposit.checkout && <Button size="lg" onClick={() => payOnSepay(deposit.checkout!)}><ExternalLink data-icon="inline-start" />{t("Thanh toán trên SePay")}</Button>}
              {deposit.simulated && (
                <Button size="lg" variant="outline" onClick={async () => { try { setDeposit({ ...(await api<Deposit>(`/wallet/deposits/${deposit.id}/simulate`, "POST")), simulated: true }); } catch (e) { toast.error((e as Error).message); } }}>
                  {t("Giả lập tiền đã về (chỉ ở máy local)")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setDeposit(null)}>{t("Đổi số tiền")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const BANKS = ["Vietcombank", "VietinBank", "BIDV", "Agribank", "Techcombank", "MB Bank", "ACB", "VPBank", "TPBank", "Sacombank", "VIB", "HDBank", "SHB", "OCB", "MSB", "SeABank", "Eximbank", "LPBank", "Nam A Bank", "Bac A Bank", "ABBANK", "Cake by VPBank", "Timo"];
type Payee = { bank_name: string; account_number: string; account_name: string };

function WithdrawDialog({ open, onOpenChange, available, saved, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; available: number; saved: Payee[]; onDone: () => void }) {
  const { t } = useI18n(),
    [amount, setAmount] = useState(0),
    [payee, setPayee] = useState<Payee>(saved[0] || { bank_name: "", account_number: "", account_name: "" }),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => { if (open) { setAmount(Math.min(available, 500000)); setPayee(saved[0] || { bank_name: "", account_number: "", account_name: "" }); setReview(false); setError(""); } }, [open]);
  const set = (k: keyof Payee) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setPayee((p) => ({ ...p, [k]: e.target.value }));
  function next(e: React.FormEvent) {
    e.preventDefault();
    if (amount < 50000 || amount > available) return setError(t("Số tiền rút từ {min} đến {max}.", { min: money(50000), max: money(available) }));
    setError("");
    setReview(true);
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api("/wallet/withdrawals", "POST", { amount, ...payee });
      toast.success(t("Đã gửi yêu cầu rút tiền"));
      onOpenChange(false);
      onDone();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="topup-dialog">
        <DialogHeader>
          <DialogTitle>{t(review ? "Kiểm tra lại" : "Rút tiền")}</DialogTitle>
          <DialogDescription className="sr-only">{t("Chọn số tiền và tài khoản nhận, kiểm tra lại rồi gửi yêu cầu.")}</DialogDescription>
        </DialogHeader>
        {!review ? (
          <form onSubmit={next} className="topup-step">
            <AmountField id="w-amount" label={t("Số tiền rút")} value={amount} onChange={setAmount} hint={t("Có thể rút {amount}", { amount: money(available) })}
              presets={[...[200000, 500000, 1000000].filter((p) => p < available).map((p) => ({ label: money(p), value: p })), { label: t("Tất cả"), value: available }]} />
            <fieldset className="payee">
              <legend>{t("Tài khoản nhận")}</legend>
              {saved.length > 0 && (
                <div className="chip-set" role="group" aria-label={t("Tài khoản đã dùng")}>
                  {saved.map((s) => <button type="button" key={s.bank_name + s.account_number} className="chip" data-checked={s.account_number === payee.account_number && s.bank_name === payee.bank_name || undefined} aria-pressed={s.account_number === payee.account_number && s.bank_name === payee.bank_name} onClick={() => setPayee(s)}>{s.bank_name} ····{s.account_number.slice(-4)}</button>)}
                  <button type="button" className="chip" onClick={() => setPayee({ bank_name: "", account_number: "", account_name: "" })}>{t("Tài khoản khác")}</button>
                </div>
              )}
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="w-bank">{t("Ngân hàng")}</FieldLabel>
                  <select id="w-bank" className="native-select" required value={payee.bank_name} onChange={set("bank_name")}>
                    <option value="" disabled>{t("Chọn ngân hàng")}</option>
                    {[...new Set([...BANKS, ...saved.map((s) => s.bank_name)])].map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field><FieldLabel htmlFor="w-number">{t("Số tài khoản")}</FieldLabel><Input id="w-number" inputMode="numeric" pattern="\d{6,20}" required value={payee.account_number} onChange={set("account_number")} aria-describedby="w-number-hint" /><small id="w-number-hint" className="field-hint">{t("6–20 chữ số")}</small></Field>
                <Field><FieldLabel htmlFor="w-name">{t("Tên chủ tài khoản")}</FieldLabel><Input id="w-name" required maxLength={80} autoCapitalize="characters" value={payee.account_name} onChange={set("account_name")} /></Field>
              </FieldGroup>
            </fieldset>
            {error && <ErrorState error={error} />}
            <Submit busy={false}>{t("Xem trước")}</Submit>
          </form>
        ) : (
          <div className="topup-step">
            <div className="withdraw-preview">
              <strong>{money(amount)}</strong>
              <dl>
                <div><dt>{t("Ngân hàng")}</dt><dd>{payee.bank_name}</dd></div>
                <div><dt>{t("Số tài khoản")}</dt><dd>{payee.account_number}</dd></div>
                <div><dt>{t("Chủ tài khoản")}</dt><dd>{payee.account_name.toUpperCase()}</dd></div>
                <div><dt>{t("Còn lại sau khi rút")}</dt><dd>{money(available - amount)}</dd></div>
              </dl>
            </div>
            <p className="withdraw-note">{t("Số tiền được giữ lại cho đến khi quản trị viên chuyển khoản, thường trong 1 ngày làm việc.")}</p>
            {error && <ErrorState error={error} />}
            <div className="topup-actions">
              <Button size="lg" disabled={busy} onClick={submit}>{busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}{t("Gửi yêu cầu rút {amount}", { amount: money(amount) })}</Button>
              <Button variant="ghost" onClick={() => setReview(false)}>{t("Sửa lại")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const WITHDRAWAL_STATE: Record<string, string> = { requested: "Đang chờ chuyển", paid: "Đã chuyển", rejected: "Đã từ chối" };

function Withdrawals({ rows }: { rows: Wallet["withdrawals"] }) {
  const { t } = useI18n();
  return (
    <section className="ledger withdrawals">
      <h2>{t("Yêu cầu rút tiền")}</h2>
      <ul>
        {rows.map((w) => (
          <li key={w.id}>
            <span className="ledger-icon" data-sign="out"><ArrowUpRight aria-hidden="true" /></span>
            <span className="ledger-text"><strong>{w.bank_name} ····{w.account_last4}</strong><time>{dateTime(w.created_at)}</time>{w.status === "rejected" && w.note && <small>{w.note}</small>}</span>
            <span className="ledger-amount"><strong>{money(w.amount)}</strong><span className="withdraw-state" data-state={w.status}>{t(WITHDRAWAL_STATE[w.status] || w.status)}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function WalletPage() {
  const { user, refresh } = useApp(),
    { t } = useI18n(),
    result = useLoad<Wallet>("/wallet"),
    [depositOpen, setDepositOpen] = useState(false),
    [withdrawOpen, setWithdrawOpen] = useState(false),
    [buying, setBuying] = useState(0),
    [params] = useSearchParams(),
    forStudent = Number(params.get("for")) || undefined;
  useEffect(() => { if (forStudent) setDepositOpen(true); }, [forStudent]);
  const returned = Number(params.get("deposit")) || 0;
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  const w = result.data, tutor = user?.role === "tutor";
  const payees = [...new Map(w.withdrawals.map((x) => [`${x.bank_name}|${x.account_number}`, { bank_name: x.bank_name, account_number: x.account_number, account_name: x.account_name }])).values()].slice(0, 3);
  async function buy(credits: number, target: HTMLElement) {
    setBuying(credits);
    try { await api("/credits/purchase", "POST", { credits }); celebrate(target); toast.success(t("Đã thêm {n} credit", { n: credits })); refresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBuying(0); }
  }
  return (
    <Page>
      <Heading title={t("Số dư học phí")} />
      {returned > 0 && <ReturnedFromSepay id={returned} result={params.get("result") || ""} onPaid={refresh} />}
      {w.payments === "off" && <p className="studio-note" role="status">{t("Nạp tiền đang tạm đóng trong lúc nền tảng hoàn tất kết nối ngân hàng.")}</p>}
      <section className="balance-card">
        <div>
          <span>{t("Có thể dùng")}</span>
          <strong>{money(w.available)}</strong>
          {w.held > 0 && <small>{t("Đang tạm giữ {amount}", { amount: money(w.held) })}</small>}
        </div>
        <div className="actions">
          <Button disabled={w.payments === "off"} onClick={() => setDepositOpen(true)}><ArrowDownLeft data-icon="inline-start" />{t("Nạp tiền")}</Button>
          <Button variant="outline" disabled={w.available < 50000} onClick={() => setWithdrawOpen(true)}><ArrowUpRight data-icon="inline-start" />{t("Rút tiền")}</Button>
        </div>
      </section>
      {w.withdrawals.length > 0 && <Withdrawals rows={w.withdrawals} />}
      {tutor && (
        <section className="credits-card">
          <header>
            <h2><Coins aria-hidden="true" />{t("Credit gửi offer")}</h2>
            <span><strong>{w.credits_free + w.credits_paid}</strong> {t("credit")} · {t("{free} miễn phí tháng này, {paid} đã mua", { free: w.credits_free, paid: w.credits_paid })}</span>
          </header>
          <p>{t("Mỗi offer gửi học sinh tốn {n} credit. Credit miễn phí reset về đầu mỗi tháng.", { n: w.settings.offer_credits })}</p>
          <div className="credit-packs">
            {w.settings.credit_packs.map((p) => (
              <button type="button" key={p.credits} className="credit-pack" disabled={!!buying || w.available < p.price} onClick={(e) => buy(p.credits, e.currentTarget)}>
                <strong>{t("{n} credit", { n: p.credits })}</strong>
                <span>{money(p.price)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="ledger">
        <h2>{t("Lịch sử")}</h2>
        {w.entries.length ? (
          <ul>
            {w.entries.map((e) => (
              <li key={e.id}>
                <span className="ledger-icon" data-sign={e.amount > 0 ? "in" : e.amount < 0 ? "out" : "neutral"}><WalletIcon aria-hidden="true" /></span>
                <span className="ledger-text"><strong>{t(KIND[e.kind] || e.kind)}</strong><time>{dateTime(e.created_at)}</time>{e.note && <small>{e.note}</small>}</span>
                <span className="ledger-amount">
                  {e.amount !== 0 && <strong data-sign={e.amount > 0 ? "in" : "out"}>{e.amount > 0 ? "+" : "−"}{money(Math.abs(e.amount))}</strong>}
                  {e.credits !== 0 && <small>{e.credits > 0 ? "+" : "−"}{Math.abs(e.credits)} {t("credit")}</small>}
                  {e.amount === 0 && e.held !== 0 && <small>{t(e.held > 0 ? "Tạm giữ" : "Bỏ giữ")} {money(Math.abs(e.held))}</small>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="credential-empty">{t("Chưa có giao dịch.")}</p>}
      </section>
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} min={w.settings.min_deposit} onPaid={refresh} forStudent={forStudent} />
      <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} available={w.available} saved={payees} onDone={refresh} />
    </Page>
  );
}

import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CircleCheck, Coins, Copy, Landmark, LoaderCircle, Wallet as WalletIcon } from "lucide-react";
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

function DepositDialog({ open, onOpenChange, min, onPaid }: { open: boolean; onOpenChange: (v: boolean) => void; min: number; onPaid: () => void }) {
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
    setBusy(true);
    setError("");
    try { setDeposit(await api<Deposit>("/wallet/deposits", "POST", { amount })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success(t("Đã chép")));
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setDeposit(null); }}>
      <DialogContent className="deposit-dialog">
        <DialogHeader>
          <DialogTitle>{t("Nạp tiền vào số dư")}</DialogTitle>
          <DialogDescription>{t("Chuyển khoản đúng nội dung để số dư tự cộng trong vài giây.")}</DialogDescription>
        </DialogHeader>
        {!deposit ? (
          <form onSubmit={create}>
            <FieldGroup>
              <div className="chip-set" role="group" aria-label={t("Số tiền gợi ý")}>
                {PRESETS.map((p) => <button type="button" key={p} className="chip" data-checked={amount === p || undefined} onClick={() => setAmount(p)}>{money(p)}</button>)}
              </div>
              <Field>
                <FieldLabel htmlFor="deposit-amount">{t("Số tiền (VND)")}</FieldLabel>
                <Input id="deposit-amount" type="number" min={min} step={1000} required value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </Field>
            </FieldGroup>
            {error && <ErrorState error={error} />}
            <div className="actions dialog-actions"><Submit busy={busy}>{t("Tạo mã chuyển khoản")}</Submit></div>
          </form>
        ) : deposit.status === "paid" ? (
          <div className="deposit-done" ref={done} role="status">
            <CircleCheck aria-hidden="true" />
            <strong>{t("Đã nhận {amount}", { amount: money(deposit.received) })}</strong>
            <Button onClick={() => onOpenChange(false)}>{t("Xong")}</Button>
          </div>
        ) : (
          <div className="deposit-pay">
            {deposit.qr_url ? <img className="deposit-qr" src={deposit.qr_url} alt={t("Mã VietQR chuyển {amount}", { amount: money(deposit.amount) })} /> : <div className="deposit-qr placeholder"><Landmark aria-hidden="true" /></div>}
            <dl>
              {deposit.account && <div><dt>{t("Số tài khoản")}</dt><dd>{deposit.account} · {deposit.bank}<button type="button" aria-label={t("Chép số tài khoản")} onClick={() => copy(deposit.account)}><Copy /></button></dd></div>}
              {deposit.holder && <div><dt>{t("Chủ tài khoản")}</dt><dd>{deposit.holder}</dd></div>}
              <div><dt>{t("Số tiền")}</dt><dd>{money(deposit.amount)}</dd></div>
              <div><dt>{t("Nội dung chuyển khoản")}</dt><dd className="deposit-code">{deposit.code}<button type="button" aria-label={t("Chép nội dung")} onClick={() => copy(deposit.code)}><Copy /></button></dd></div>
            </dl>
            <p className="deposit-wait"><LoaderCircle className="animate-spin" aria-hidden="true" />{t("Đang chờ tiền về…")}</p>
            {deposit.simulated && (
              <Button variant="outline" onClick={async () => { try { setDeposit({ ...(await api<Deposit>(`/wallet/deposits/${deposit.id}/simulate`, "POST")), simulated: true }); } catch (e) { toast.error((e as Error).message); } }}>
                {t("Giả lập tiền đã về (chỉ ở máy local)")}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({ open, onOpenChange, available, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; available: number; onDone: () => void }) {
  const { t } = useI18n(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/wallet/withdrawals", "POST", { amount: Number(f.get("amount")), bank_name: f.get("bank_name"), account_number: f.get("account_number"), account_name: f.get("account_name") });
      toast.success(t("Đã gửi yêu cầu rút tiền vào hội thoại với quản trị viên"));
      onOpenChange(false);
      onDone();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Rút tiền")}</DialogTitle>
          <DialogDescription>{t("Quản trị viên chuyển khoản và xác nhận trong tin nhắn hỗ trợ. Số tiền được giữ lại đến khi xong.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="w-amount">{t("Số tiền (tối đa {amount})", { amount: money(available) })}</FieldLabel><Input id="w-amount" name="amount" type="number" min={50000} max={available} step={1000} required /></Field>
            <Field><FieldLabel htmlFor="w-bank">{t("Ngân hàng")}</FieldLabel><Input id="w-bank" name="bank_name" required maxLength={80} /></Field>
            <Field><FieldLabel htmlFor="w-number">{t("Số tài khoản")}</FieldLabel><Input id="w-number" name="account_number" inputMode="numeric" pattern="\d{6,20}" required /></Field>
            <Field><FieldLabel htmlFor="w-name">{t("Tên chủ tài khoản")}</FieldLabel><Input id="w-name" name="account_name" required maxLength={80} /></Field>
          </FieldGroup>
          {error && <ErrorState error={error} />}
          <div className="actions dialog-actions"><Submit busy={busy}>{t("Gửi yêu cầu")}</Submit></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function WalletPage() {
  const { user, refresh } = useApp(),
    { t } = useI18n(),
    result = useLoad<Wallet>("/wallet"),
    [depositOpen, setDepositOpen] = useState(false),
    [withdrawOpen, setWithdrawOpen] = useState(false),
    [buying, setBuying] = useState(0);
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  const w = result.data, tutor = user?.role === "tutor";
  async function buy(credits: number, target: HTMLElement) {
    setBuying(credits);
    try { await api("/credits/purchase", "POST", { credits }); celebrate(target); toast.success(t("Đã thêm {n} credit", { n: credits })); refresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBuying(0); }
  }
  return (
    <Page>
      <Heading title={t("Số dư học phí")} />
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
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} min={w.settings.min_deposit} onPaid={refresh} />
      <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} available={w.available} onDone={refresh} />
    </Page>
  );
}

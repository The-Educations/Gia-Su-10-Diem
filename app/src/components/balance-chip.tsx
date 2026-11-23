import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { money, useApp } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { useI18n } from "@/lib/i18n";

// The balance, always in reach for people who pay or get paid — kept fresh by
// the shared wallet store, and honest when it could not load.
export function BalanceChip() {
  const { user } = useApp(), { t } = useI18n();
  const show = !!user && user.role !== "admin" && user.onboarding_step >= 3;
  const w = useWallet();
  if (!show) return null;
  if (!w.data)
    return (
      <button type="button" className="balance-chip balance-chip-error" aria-label={t("Chưa tải được số dư — bấm để thử lại")} title={w.error} onClick={() => void w.refresh()}>
        <Wallet aria-hidden="true" />
        <span>—</span>
      </button>
    );
  return (
    <Link to="/wallet" className="balance-chip" aria-label={t("Số dư {amount}", { amount: money(w.data.available) })}>
      <Wallet aria-hidden="true" />
      <span>{money(w.data.available)}</span>
    </Link>
  );
}

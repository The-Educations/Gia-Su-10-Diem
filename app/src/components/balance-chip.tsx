import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Wallet as WalletData } from "@/lib/types";

// The balance, always in reach for people who pay or get paid.
export function BalanceChip() {
  const { user } = useApp(), { t } = useI18n();
  const show = !!user && user.role !== "admin" && user.onboarding_step >= 3;
  const w = useLoad<WalletData>(show ? "/wallet" : null);
  if (!show || !w.data) return null;
  return (
    <Link to="/wallet" className="balance-chip" aria-label={t("Số dư {amount}", { amount: money(w.data.available) })}>
      <Wallet aria-hidden="true" />
      <span>{money(w.data.available)}</span>
    </Link>
  );
}

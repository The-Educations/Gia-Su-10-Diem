import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, money, useApp } from "./api";
import { useI18n } from "./i18n";
import type { Deposit, Wallet } from "./types";

// One wallet view for the whole app: the chip, the wallet page and every
// money-changing action read and refresh the same source, so the balance
// can never drift between places.
const WalletCtx = createContext<{
  data: Wallet | null;
  error: string;
  refresh: () => Promise<void>;
  watchDeposit: (id: number) => void;
}>({ data: null, error: "", refresh: async () => {}, watchDeposit: () => {} });
export const useWallet = () => useContext(WalletCtx);

// Pending top-up ids survive a reload: the watcher keeps polling until the
// transfer lands or the order is 30 minutes old.
const PENDING_KEY = "giasu.pendingDeposits";
const PENDING_TTL = 30 * 60 * 1000;
const pending = (): { id: number; since: number }[] => {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || "[]"); } catch { return []; }
};
const savePending = (rows: { id: number; since: number }[]) => {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(rows)); } catch { /* private mode */ }
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user } = useApp(), { t } = useI18n();
  const [data, setData] = useState<Wallet | null>(null);
  const [error, setError] = useState("");
  const announced = useRef<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) return setData(null);
    try { setData(await api<Wallet>("/wallet")); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, [user?.id]);

  const watchDeposit = useCallback((id: number) => {
    const rows = pending().filter((r) => r.id !== id);
    rows.push({ id, since: Date.now() });
    savePending(rows);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Background follow-up for pending deposits, so a transfer is seen even
  // when the dialog was closed or the user moved to another page.
  useEffect(() => {
    if (!user) return;
    const tick = async () => {
      const rows = pending().filter((r) => Date.now() - r.since < PENDING_TTL);
      const keep: typeof rows = [];
      for (const row of rows) {
        try {
          const d = await api<Deposit>(`/wallet/deposits/${row.id}`);
          if (d.status === "paid") {
            if (!announced.current.has(row.id)) {
              announced.current.add(row.id);
              toast.success(t("Đã nhận {amount} vào số dư", { amount: money(d.received || d.amount) }));
            }
            void refresh();
          } else keep.push(row);
        } catch { keep.push(row); /* network blip — try again next tick */ }
      }
      savePending(keep);
    };
    const timer = setInterval(() => { if (!document.hidden) void tick(); }, 3000);
    const onVisible = () => { if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [user?.id, refresh, t]);

  return <WalletCtx.Provider value={{ data, error, refresh, watchDeposit }}>{children}</WalletCtx.Provider>;
}

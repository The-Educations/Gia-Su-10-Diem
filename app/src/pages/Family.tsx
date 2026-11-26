import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CalendarDays, Copy, RefreshCw, UserPlus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { celebrate } from "@/lib/celebrate";
import { Blank, ErrorState, Heading, Loading, Page, Person, Submit } from "@/components/common";
import { dayOf, timeOf } from "@/components/session-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import "@/calendar.css";
import "@/money.css";

type Child = {
  id: number; name: string; school: string; available: number; held: number; pending_offers: number;
  classes: { id: number; title: string; color: string; sessions_total: number; done: number; status: string; next_at: string | null }[];
};
type Family = { role: "parent"; children: Child[] } | { role: "student"; code: string; parents: { id: number; name: string }[] };

function LinkForm({ onLinked }: { onLinked: () => void }) {
  const { t } = useI18n(), [code, setCode] = useState(""), [busy, setBusy] = useState(false);
  return (
    <form className="family-link" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try { await api("/family/link", "POST", { code }); celebrate(e.currentTarget as HTMLElement); toast.success(t("Đã liên kết với con")); setCode(""); onLinked(); }
      catch (err) { toast.error((err as Error).message); }
      finally { setBusy(false); }
    }}>
      <Field>
        <FieldLabel htmlFor="family-code">{t("Mã mời của con (6 ký tự, xem trong Cài đặt của con)")}</FieldLabel>
        <Input id="family-code" value={code} maxLength={6} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} required pattern="[A-Za-z0-9]{6}" />
      </Field>
      <Submit busy={busy}><UserPlus data-icon="inline-start" />{t("Liên kết")}</Submit>
    </form>
  );
}

export function StudentCode() {
  const { t } = useI18n(), result = useLoad<Family>("/family");
  if (!result.data || result.data.role !== "student") return null;
  const f = result.data;
  return (
    <section className="family-code-card">
      <h2>{t("Liên kết với phụ huynh")}</h2>
      <p>{t("Phụ huynh nhập mã này để theo dõi lịch học và nạp tiền cho bạn.")}</p>
      <p>{t("Phụ huynh được báo khi buổi học bị hủy, dời hoặc báo vấn đề, khi có đề nghị, gia hạn, gói kết thúc và khi bạn rút tiền. Thông báo không kèm tin nhắn, đánh giá riêng hay lý do bạn báo vấn đề.")}</p>
      <div className="family-code">
        <strong>{f.code}</strong>
        <Button variant="ghost" size="icon" aria-label={t("Chép mã")} onClick={() => navigator.clipboard?.writeText(f.code).then(() => toast.success(t("Đã chép")))}><Copy /></Button>
        <Button variant="ghost" size="icon" aria-label={t("Đổi mã")} onClick={async () => { await api("/family/code", "POST"); result.reload(); }}><RefreshCw /></Button>
      </div>
      {f.parents.length > 0 && <p className="muted">{t("Đã liên kết: {names}", { names: f.parents.map((p) => p.name).join(", ") })}</p>}
    </section>
  );
}

// A notice links to /family?child=<id>: bring that card into view and mark it for a moment.
// A child who is no longer linked has no card, and the page simply shows as usual.
function useChildFocus(ready: boolean) {
  const [params] = useSearchParams(), { key } = useLocation(), wanted = Number(params.get("child")) || 0;
  const [focused, setFocused] = useState(0);
  useEffect(() => {
    const card = ready && wanted ? document.getElementById(`child-${wanted}`) : null;
    if (!card) return;
    setFocused(wanted);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = requestAnimationFrame(() => card.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" }));
    const timer = setTimeout(() => setFocused(0), 4000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); setFocused(0); };
  }, [ready, wanted, key]);
  return focused;
}

export default function FamilyPage() {
  const { user } = useApp(), { t } = useI18n(), result = useLoad<Family>("/family");
  const focused = useChildFocus(result.data?.role === "parent");
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  if (result.data.role === "student") return <Page><Heading title={t("Gia đình")} /><StudentCode /></Page>;
  const kids = result.data.children;
  return (
    <Page>
      <Heading title={t("Con của tôi")} action={<Button asChild><Link to="/tutors">{t("Tìm gia sư cho con")}</Link></Button>} />
      {!kids.length && <Blank title={t("Chưa liên kết với tài khoản của con")} />}
      <div className="family-grid">
        {kids.map((k) => (
          <article key={k.id} id={`child-${k.id}`} className="family-child" data-focus={focused === k.id || undefined}>
            <header>
              <Person name={k.name} id={k.id} />
              <div><strong>{k.name}</strong>{k.school && <small>{k.school}</small>}</div>
              {k.pending_offers > 0 && <Link to="/proposals" className="proposal-status">{t("{n} đề nghị chờ", { n: k.pending_offers })}</Link>}
            </header>
            <div className="family-balance">
              <Wallet aria-hidden="true" />
              <span>{t("Số dư")} <strong>{money(k.available)}</strong>{k.held > 0 && <small> · {t("Đang tạm giữ {amount}", { amount: money(k.held) })}</small>}</span>
              <Button size="sm" variant="outline" asChild><Link to={`/wallet?for=${k.id}`}>{t("Nạp cho con")}</Link></Button>
            </div>
            {k.classes.length ? (
              <ul className="family-classes">
                {k.classes.map((c) => (
                  <li key={c.id} data-color={c.color}>
                    <Link to={`/classes/${c.id}`}>
                      <strong>{c.title}</strong>
                      <span>{t("{done}/{total} buổi", { done: c.done, total: c.sessions_total })}{c.status !== "active" && ` · ${t("Đã kết thúc")}`}</span>
                      {c.next_at && <span className="class-next"><CalendarDays aria-hidden="true" />{dayOf(c.next_at)} · {timeOf(c.next_at)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="credential-empty">{t("Con chưa có lớp học.")}</p>}
          </article>
        ))}
      </div>
      {user?.learner_type === "parent" && (
        <section className="class-section"><header><h2>{t("Thêm tài khoản của con")}</h2></header><LinkForm onLinked={result.reload} /></section>
      )}
    </Page>
  );
}

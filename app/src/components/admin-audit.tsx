import { useState } from "react";
import { Link } from "react-router-dom";
import { api, dateTime, money, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Blank, ErrorState, Loading } from "./common";
import { AdminSearch, AdminToolbar, AUDIT_LABELS, FilterChips } from "./admin-kit";
import { AdminUserOverview } from "./admin-classes";
import { Button } from "./ui/button";

const GROUPS: [string, string][] = [
  ["accounts", "Tài khoản"],
  ["tutors", "Gia sư"],
  ["money", "Tài chính"],
  ["classes", "Lớp học"],
  ["catalog", "Danh mục"],
  ["content", "Cộng đồng & tin"],
];
// Server-side LIKE patterns per group — comma lists are OR-ed in /api/admin/audit.
const GROUP_ACTIONS: Record<string, string> = {
  accounts: "user.%,student.verification.%,google_%",
  tutors: "tutor.%,credential.%,theme.%,gallery.%,upload.%",
  money: "withdrawal.%,wallet.%,deposit.%,deposits.%,settings.%",
  classes: "session.%,member.%,proposal.%,booking.%",
  catalog: "subject.%,resource.%",
  content: "community.%,%_post,upload_news_image",
};

// Raw enum words in details, spelled out.
const WORDS: Record<string, string> = {
  approved: "đã duyệt", rejected: "từ chối", withdrawn: "đã gỡ", pending: "chờ duyệt",
  active: "đã mở", suspended: "tạm khóa", confirmed: "đã xác nhận", refunded: "đã hoàn tiền",
  charged: "đã tính phí", disputed: "đang báo", paid: "đã chuyển",
};

type Row = {
  id: number; actor_id: number; action: string; target: string; detail: string | null;
  created_at: string; name: string; credential_tutor: number | null;
};

const detailOf = (a: Row) => { try { return a.detail ? JSON.parse(a.detail) : null; } catch { return null; } };

// One readable line from the JSON detail: what changed, how much, why.
function describe(a: Row, t: ReturnType<typeof useI18n>["t"]): string {
  const d = detailOf(a);
  if (!d) return "";
  const parts: string[] = [];
  const push = (...xs: unknown[]) => { for (const x of xs) if (typeof x === "string" ? x !== "" : typeof x === "number") parts.push(String(x)); };
  if (a.action === "wallet.adjust") { push(d.amount ? `${d.amount > 0 ? "+" : ""}${money(d.amount)}` : null, d.note, d.balance_after != null && t("còn {x}", { x: money(d.balance_after) })); }
  else if (/^withdrawal\./.test(a.action)) { push(d.amount && money(d.amount), d.note); }
  else if (a.action === "settings.update" && d.changed) { push(Object.entries(d.changed as Record<string, [unknown, unknown]>).map(([k, [o, n]]) => `${k}: ${JSON.stringify(o)} → ${JSON.stringify(n)}`).join(", ")); }
  else if (a.action === "deposits.recheck") { push(t("{n}/{total} lệnh được ghi nhận", { n: d.credited ?? 0, total: d.checked ?? 0 })); }
  else if (a.action === "deposit.assign") { push(d.code, d.amount && money(d.amount), d.event); }
  else if (a.action === "deposit.dismissed") { push(d.amount && money(d.amount), d.reason); }
  else if (a.action === "session.admin_cancel") { push(d.note, d.refunded?.length && t("hoàn {x} cho {n} học sinh", { x: money(d.refunded.reduce((s: number, r: { amount?: number }) => s + (r.amount || 0), 0)), n: d.refunded.length })); }
  else if (/^session\.resolve\./.test(a.action)) { push(WORDS[d.outcome] || d.outcome, d.member_id && `#${d.member_id}`); }
  else if (a.action === "member.admin_end") { push(d.refunded && t("hoàn {x}", { x: money(d.refunded) })); }
  else { push(d.title, d.name, d.email, d.note, d.reason, WORDS[d.status] || d.status, d.revision && t("(bản {n})", { n: d.revision }), d.published !== undefined && (d.published ? t("hiện") : t("ẩn"))); }
  return parts.filter(Boolean).join(" · ");
}

export function AdminAudit() {
  const { t } = useI18n(),
    [q, setQ] = useState(""),
    [group, setGroup] = useState(""),
    [actor, setActor] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [person, setPerson] = useState<number | null>(null),
    [tail, setTail] = useState<{ rows: Row[]; next: number | null } | null>(null);
  const label = (a: string) => AUDIT_LABELS[a] || a;
  const reset = () => setTail(null);
  const params = new URLSearchParams();
  if (GROUP_ACTIONS[group]) params.set("action", GROUP_ACTIONS[group]);
  if (actor) params.set("actor", actor);
  if (from) params.set("from", `${from} 00:00:00`);
  if (to) params.set("to", `${to} 23:59:59`);
  if (q) params.set("q", q);
  params.set("limit", "50");
  const result = useLoad<{ rows: Row[]; next: number | null }>(`/admin/audit?${params}`);
  const rows = [...(result.data?.rows || []), ...(tail?.rows || [])];
  const next = tail ? tail.next : result.data?.next;
  const go = (to: string, label: string) => <Link className="text-link" to={to}>{t(label)}</Link>;
  async function loadMore() {
    if (!next) return;
    const p = new URLSearchParams(params); p.set("before", String(next));
    const r = await api<{ rows: Row[]; next: number | null }>(`/admin/audit?${p}`);
    setTail((old) => ({ rows: [...(old?.rows || []), ...r.rows], next: r.next }));
  }
  // Where an entry points: each action deep-links to the screen holding that record.
  const target = (a: Row) => {
    const d = detailOf(a), id = String(a.target), num = Number(id) || 0;
    const who = d?.email || d?.name;
    if (/^user\.(active|suspended|promoted_to_admin)$/.test(a.action) || a.action === "wallet.adjust" || a.action === "google_admin_granted" || a.action === "community.user.lock" || a.action === "community.user.unlock")
      return <Button size="xs" variant="ghost" onClick={() => setPerson(num || d?.user_id || 0)}>{who || t("Xem tài khoản")}</Button>;
    if (/^student\.verification\./.test(a.action)) return who ? <Button size="xs" variant="ghost" onClick={() => setPerson(num)}>{who}</Button> : go(`/admin?tab=students&student=${num}`, "Xem học sinh");
    if (/^tutor\.|^credential\.|^theme\.granted/.test(a.action)) { const tid = /^credential\./.test(a.action) ? a.credential_tutor : num; const lbl = d?.name || (tid ? `#${tid}` : ""); return tid ? go(`/admin?tab=tutors&tutor=${tid}`, lbl || "Xem hồ sơ") : <span className="muted">{lbl || "—"}</span>; }
    if (/^withdrawal\./.test(a.action)) return go(`/admin?tab=finance&fin=payouts&withdrawal=${num}`, t("Lệnh rút #{id}", { id }));
    if (a.action === "deposits.recheck" || a.action === "deposit.dismissed") return go("/admin?tab=finance&fin=deposits", a.action === "deposits.recheck" ? t("Kiểm tra nạp") : (d?.event || t("Sự kiện nạp")));
    if (a.action === "deposit.assign") return go(`/admin?tab=finance&fin=deposits&deposit=${num}`, d?.code || t("Lệnh nạp"));
    if (a.action === "settings.update") return go("/admin?tab=finance&fin=settings", t("Cài đặt"));
    if (/^session\./.test(a.action)) return go(`/sessions?session=${num}`, d?.session || `${t("Buổi")} #${num}`);
    if (a.action === "member.admin_end") return go(`/sessions?member=${num}`, `${t("Gói")} #${num}`);
    if (/^booking\./.test(a.action)) return go(`/sessions?booking=${num}`, d?.subject || `${t("Đặt lịch")} #${num}`);
    if (/^subject\./.test(a.action)) return go(`/admin?tab=catalog&subject=${encodeURIComponent(id)}`, d?.title || id);
    if (/^resource\./.test(a.action)) return go(`/admin?tab=catalog&resource=${num}`, d?.title || `#${num}`);
    if (/^community\./.test(a.action)) return go("/admin?tab=community", d?.title || t("Cộng đồng"));
    if (/_post$|news/.test(a.action)) return go("/admin?tab=posts", t("Tin tức"));
    if (!id || id === "0" || id === "rules") return <span className="muted">{d?.title || "—"}</span>;
    return <span className="muted">#{a.target}</span>;
  };
  return (
    <div className="admin-pane">
      <AdminToolbar>
        <AdminSearch value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Tìm trong nhật ký…" />
        <FilterChips label="Nhóm thao tác" value={group} onChange={(v) => { setGroup(v); reset(); }} options={[{ value: "", label: "Tất cả" }, ...GROUPS.map(([value, name]) => ({ value, label: name }))]} />
        <AdminSearch value={actor} onChange={(v) => { setActor(v); reset(); }} placeholder="Người thực hiện…" />
        <span className="audit-range">
          <input type="date" aria-label={t("Từ ngày")} value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} />
          <input type="date" aria-label={t("Đến ngày")} value={to} onChange={(e) => { setTo(e.target.value); reset(); }} />
        </span>
      </AdminToolbar>
      {result.loading && !rows.length ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : rows.length ? (
        <>
          <table className="finance-table audit-table">
            <thead><tr><th>{t("Thao tác")}</th><th>{t("Người thực hiện")}</th><th>{t("Đối tượng")}</th><th className="num">{t("Thời gian")}</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const detail = describe(a, t);
                return (
                  <tr key={a.id}>
                    <td>{t(label(a.action))}{detail && <small>{detail}</small>}</td>
                    <td>{a.name}</td>
                    <td>{target(a)}</td>
                    <td className="num">{dateTime(a.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {next ? <div className="audit-more"><Button variant="outline" size="sm" onClick={loadMore}>{t("Tải thêm")}</Button></div> : null}
        </>
      ) : <Blank title={t("Không có kết quả phù hợp")} />}
      <AdminUserOverview userId={person} onClose={() => setPerson(null)} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, fold } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { accountRole, type AdminData } from "@/lib/types";
import { lockAction } from "@/pages/AdminCommunity";
import ActionDialog, { type CommunityAction } from "./community/ActionDialog";
import { Blank, ErrorState, Person, State, Submit } from "./common";
import { AdminSearch, AdminToolbar, FilterChips, RowMenu } from "./admin-kit";
import { AdminUserOverview } from "./admin-classes";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

type Account = AdminData["users"][number];
type Step = { user: Account; kind: "status" | "admin" | "delete" };
const ROLES = [["student", "Học sinh"], ["parent", "Phụ huynh"], ["tutor", "Gia sư"], ["admin", "Quản trị viên"]] as const;
const roleOf = (u: Account) => (u.role === "student" && u.learner_type === "parent" ? "parent" : u.role);
const joined = (s: string) => new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").toLocaleDateString("vi-VN");

export function AdminAccounts({ users, onChanged }: { users: Account[]; onChanged: () => void }) {
  const { t } = useI18n(),
    [, setParams] = useSearchParams(),
    [q, setQ] = useState(""),
    [role, setRole] = useState(""),
    [status, setStatus] = useState(""),
    [overview, setOverview] = useState<number | null>(null),
    [lock, setLock] = useState<CommunityAction | null>(null),
    [step, setStep] = useState<Step | null>(null),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const found = users.filter((u) => fold(`${u.name} ${u.email}`).includes(fold(q)));
  const shown = found.filter((u) => (!role || roleOf(u) === role) && (!status || (status === "locked" ? !!Number(u.community_locked) : u.status === status)));
  const open = (user: Account, kind: Step["kind"]) => { setError(""); setEmail(""); setStep({ user, kind }); };
  // Deep link (e.g. from the audit log): /admin?tab=users&user=<id> opens the overview.
  const wanted = Number(useSearchParams()[0].get("user")) || null;
  useEffect(() => { if (wanted && users.some((u) => u.id === wanted)) setOverview(wanted); }, [wanted]); // eslint-disable-line react-hooks/exhaustive-deps
  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!step) return;
    const { user, kind } = step;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${user.id}${kind === "admin" ? "/role" : ""}`, kind === "delete" ? "DELETE" : "PATCH",
        kind === "delete" ? { email } : kind === "admin" ? { role: "admin" } : { status: user.status === "active" ? "suspended" : "active" });
      setStep(null);
      onChanged();
      toast.success(t("Đã lưu thay đổi"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const s = step?.user, kind = step?.kind;
  return (
    <div className="admin-pane">
      <AdminToolbar>
        <AdminSearch value={q} onChange={setQ} placeholder="Tìm theo tên hoặc email…" />
        <FilterChips label="Vai trò" value={role} onChange={setRole} options={[
          { value: "", label: "Tất cả", count: found.length },
          ...ROLES.map(([v, label]) => ({ value: v, label, count: found.filter((u) => roleOf(u) === v).length })),
        ]} />
        <FilterChips label="Trạng thái" value={status} onChange={(v) => setStatus(v === status ? "" : v)} options={[
          { value: "suspended", label: "Tạm khóa", count: found.filter((u) => u.status === "suspended").length },
          { value: "locked", label: "Khóa cộng đồng", count: found.filter((u) => Number(u.community_locked)).length },
        ]} />
      </AdminToolbar>
      {!shown.length && <Blank title={t("Không có kết quả phù hợp")} action={<Button variant="outline" onClick={() => { setQ(""); setRole(""); setStatus(""); }}>{t("Xóa bộ lọc")}</Button>} />}
      <div className="admin-list admin-rows">
        {shown.map((u) => (
          <article key={u.id} className="account-row">
            <Person name={u.name} id={u.id} />
            <button type="button" className="admin-row-title" onClick={() => setOverview(u.id)}>
              <strong>{u.name}</strong>
              <small>{u.email}</small>
            </button>
            <span className="admin-row-meta">{t(accountRole(u))}{u.demo ? ` · ${t("Tài khoản mẫu")}` : ""}<small>{t("Tham gia {date}", { date: joined(u.created_at) })}</small></span>
            <span className="admin-row-state">
              <State value={u.status} />
              {!!Number(u.community_locked) && <span className="admin-flag">{t("Khóa cộng đồng")}</span>}
            </span>
            <Button variant="outline" size="sm" onClick={() => setOverview(u.id)}>{t("Tổng quan")}</Button>
            <RowMenu label={t("Thao tác với {name}", { name: u.name })} items={[
              { label: Number(u.community_locked) ? "Mở quyền Cộng đồng" : "Khóa quyền Cộng đồng", onSelect: () => setLock(lockAction(u)) },
              { label: "Cấp quyền quản trị", hidden: u.role === "admin" || u.status !== "active", onSelect: () => open(u, "admin") },
              { label: u.status === "active" ? "Tạm khóa" : "Kích hoạt", hidden: u.role === "admin", onSelect: () => open(u, "status") },
              { label: "Xóa tài khoản", danger: true, hidden: u.role === "admin", onSelect: () => open(u, "delete") },
            ]} />
          </article>
        ))}
      </div>
      <AdminUserOverview userId={overview} onClose={() => { setOverview(null); setParams((p) => { const n = new URLSearchParams(p); n.delete("user"); return n; }); }} />
      {lock && <ActionDialog action={lock} close={() => setLock(null)} done={onChanged} />}
      <Dialog open={!!step} onOpenChange={(o) => { if (!o && !busy) setStep(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(kind === "delete" ? "Xóa tài khoản?" : kind === "admin" ? "Cấp quyền quản trị?" : s?.status === "active" ? "Tạm khóa tài khoản?" : "Kích hoạt tài khoản?")}</DialogTitle>
            <DialogDescription>
              {s?.name} · {s?.email}.{" "}
              {t(kind === "delete"
                ? "Hồ sơ cá nhân, email và ảnh sẽ bị xóa; mọi phiên đăng nhập bị thu hồi. Lịch đang chờ hoặc đã nhận sẽ bị hủy. Lịch sử học và tin nhắn được giữ dưới tên Tài khoản đã xóa. Không thể khôi phục tài khoản này."
                : kind === "admin" ? "Tài khoản sẽ chuyển sang quản trị viên, có quyền quản lý tài khoản, hồ sơ và danh mục. Người này cần đăng nhập lại."
                : s?.status === "active" ? "Tạm khóa sẽ đăng xuất mọi phiên của tài khoản." : "Tài khoản đăng nhập lại được ngay.")}
            </DialogDescription>
          </DialogHeader>
          {error && <ErrorState error={error} />}
          <form onSubmit={confirm}>
            {kind === "delete" && <Field className="mb-4"><FieldLabel htmlFor="delete-account-email">{t("Nhập lại email tài khoản để xác nhận")}</FieldLabel><Input id="delete-account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required /></Field>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setStep(null)}>{t("Hủy")}</Button>
              <Submit busy={busy} disabled={kind === "delete" && email.trim().toLowerCase() !== s?.email.toLowerCase()}>
                {t(kind === "delete" ? "Xác nhận xóa tài khoản" : kind === "admin" ? "Xác nhận cấp quyền" : "Xác nhận")}
              </Submit>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, fold, money, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AdminData, Subject, Tutor } from "@/lib/types";
import { TutorReviewDialog } from "./tutor-review-dialog";
import { Blank, ErrorState, Person, State } from "./common";
import { AdminSearch, AdminToolbar, FilterChips, RowMenu } from "./admin-kit";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

const STATUSES = [["pending", "Chờ duyệt"], ["approved", "Đã công bố"], ["rejected", "Cần bổ sung"], ["withdrawn", "Đã gỡ hồ sơ"]] as const;

export function AdminTutors({ data, subjects, onChanged }: { data: AdminData; subjects: Subject[]; onChanged: () => void }) {
  const { t } = useI18n(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    status = params.get("status") || "",
    proofs = useLoad<{ tutor_id: number; count: number }[]>("/admin/credentials/pending"),
    [q, setQ] = useState(""),
    [tutor, setTutor] = useState<Tutor | null>(null),
    [reviewOpen, setReviewOpen] = useState(false),
    [withdraw, setWithdraw] = useState<Tutor | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const names = new Map(subjects.map((s) => [s.id, s.name]));
  const found = data.tutors.filter((x) => fold(`${x.name} ${x.headline} ${x.email || ""}`).includes(fold(q)));
  // Waiting work first: new profiles, then edits and proofs to check.
  const waiting = (x: Tutor) => Number(x.status === "pending") * 4 + Number(!!x.published) * 2 + Number(!!proofs.data?.some((p) => p.tutor_id === x.user_id));
  const shown = found.filter((x) => !status || x.status === status).sort((a, b) => waiting(b) - waiting(a));
  const setStatus = (v: string) => setParams(v ? { tab: "tutors", status: v } : { tab: "tutors" });
  async function confirmWithdraw() {
    if (!withdraw) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/tutors/${withdraw.user_id}`, "PATCH", { status: "withdrawn", revision: withdraw.review_revision });
      setWithdraw(null);
      onChanged();
      toast.success(t("Đã gỡ hồ sơ"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-pane">
      <AdminToolbar>
        <AdminSearch value={q} onChange={setQ} placeholder="Tìm gia sư…" />
        <FilterChips label="Trạng thái hồ sơ" value={status} onChange={setStatus} options={[
          { value: "", label: "Tất cả", count: found.length },
          ...STATUSES.map(([value, label]) => ({ value, label, count: found.filter((x) => x.status === value).length })),
        ]} />
      </AdminToolbar>
      {!shown.length && <Blank title={t(status === "pending" && !q ? "Không có hồ sơ nào chờ duyệt" : "Không có kết quả phù hợp")} action={<Button variant="outline" onClick={() => { setQ(""); setStatus(""); }}>{t("Xem tất cả hồ sơ")}</Button>} />}
      <div className="admin-list admin-rows">
        {shown.map((x) => {
          const proof = proofs.data?.find((p) => p.tutor_id === x.user_id);
          return (
            <article key={x.user_id} className="tutor-row">
              <Person name={x.name} id={x.user_id} src={x.photo_url || undefined} />
              <div className="admin-row-title">
                <strong>{x.name}</strong>
                <small>{x.headline || t("Chưa hoàn thiện hồ sơ")}</small>
              </div>
              <span className="admin-row-meta">
                {x.subjects.map((id) => names.get(id) || id).join(", ") || "—"}
                <small>{money(x.rate)} / {t("buổi")}{x.demo ? ` · ${t("Hồ sơ mẫu")}` : ""}</small>
              </span>
              <span className="admin-row-state">
                <State value={x.status === "pending" ? "pending_profile" : x.status} />
                {x.published && <span className="admin-flag">{t("Có bản sửa chờ duyệt")}</span>}
                {proof && <span className="admin-flag">{t("{n} minh chứng chờ đối chiếu", { n: proof.count })}</span>}
              </span>
              <Button variant={x.status === "pending" || x.published || proof ? "default" : "outline"} size="sm" onClick={(e) => { trigger.current = e.currentTarget; setTutor(x); setReviewOpen(true); }}>
                {t("Xem & duyệt")}
              </Button>
              <RowMenu label={t("Thao tác với {name}", { name: x.name })} items={[
                { label: "Trang công khai", hidden: x.status !== "approved", onSelect: () => navigate(`/tutors/${x.user_id}`) },
                { label: "Gỡ hồ sơ", danger: true, hidden: x.status === "withdrawn", onSelect: () => { setError(""); setWithdraw(x); } },
              ]} />
            </article>
          );
        })}
      </div>
      <TutorReviewDialog tutor={tutor} catalog={data.theme_catalog} subjects={subjects} open={reviewOpen} onOpenChange={setReviewOpen} onSaved={() => { onChanged(); proofs.reload(); }} returnFocus={() => {
        if (trigger.current?.isConnected) trigger.current.focus();
        else document.getElementById("admin-search")?.focus();
      }} />
      <Dialog open={!!withdraw} onOpenChange={(o) => { if (!o && !busy) setWithdraw(null); }}>
        <DialogContent closeDisabled={busy} onCloseAutoFocus={(e) => { e.preventDefault(); document.getElementById("admin-search")?.focus(); }}>
          <DialogHeader>
            <DialogTitle>{t("Gỡ hồ sơ gia sư?")}</DialogTitle>
            <DialogDescription>{t("Hồ sơ của {name} sẽ ngừng hiển thị công khai. Tài khoản, tin nhắn và lịch đã đặt được giữ lại. Có thể duyệt lại để công bố.", { name: withdraw?.name || "" })}</DialogDescription>
          </DialogHeader>
          {error && <ErrorState error={error} />}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setWithdraw(null)}>{t("Hủy")}</Button>
            <Button variant="destructive" disabled={busy} onClick={confirmWithdraw}>{t(busy ? "Đang gỡ…" : "Xác nhận gỡ hồ sơ")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

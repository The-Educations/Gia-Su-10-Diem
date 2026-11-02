import { useRef, useState } from "react";
import { LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Tutor, ProfileTheme, Subject } from "@/lib/types";
import { TutorPresentation } from "./tutor-presentation";
import { TutorGallery } from "./tutor-gallery";
import { TutorInventory } from "./tutor-inventory";
import { Button } from "./ui/button";
import { ErrorState } from "./common";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

export function TutorReviewDialog({ tutor, catalog, subjects, open, onOpenChange, onSaved, returnFocus }: {
  tutor: Tutor | null; catalog: ProfileTheme[]; subjects: Subject[]; open: boolean;
  onOpenChange: (open: boolean) => void; onSaved: () => void; returnFocus: () => void;
}) {
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  async function review(status: "approved" | "rejected") {
    if (!tutor) return;
    setBusy(status); setError("");
    try {
      await api(`/admin/tutors/${tutor.user_id}`, "PATCH", { status, revision: tutor.review_revision });
      onOpenChange(false); onSaved();
      toast.success(status === "approved" ? "Đã duyệt và công bố hồ sơ" : "Đã gửi email yêu cầu cập nhật hồ sơ");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) { setError(""); onOpenChange(value); } }}>
    <DialogContent className="tutor-review-dialog" closeDisabled={!!busy} aria-busy={!!busy} onOpenAutoFocus={e => { e.preventDefault(); title.current?.focus({ preventScroll: true }); }} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }} onCloseAutoFocus={e => { e.preventDefault(); returnFocus(); }}>
      <DialogHeader><DialogTitle ref={title} tabIndex={-1}>Xem & duyệt hồ sơ</DialogTitle><DialogDescription>{tutor?.name}</DialogDescription></DialogHeader>
      <div className="tutor-review-body">{tutor && <>
        <TutorPresentation tutor={tutor} subjects={subjects} preview />
        <TutorGallery images={tutor.gallery || []} name={tutor.name} />
        <TutorInventory key={tutor.user_id} tutor={tutor} catalog={catalog} />
      </>}</div>
      <div className="tutor-review-actions">
        <span className="sr-only" role="status">{busy === "approved" ? "Đang duyệt hồ sơ" : busy === "rejected" ? "Đang gửi email yêu cầu bổ sung" : ""}</span>
        {error && <ErrorState error={error} />}
        <div className="actions"><Button disabled={!!busy} onClick={() => review("approved")}>{busy === "approved" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}Duyệt & công bố</Button>
          <Button variant="outline" disabled={!!busy || tutor?.status === "rejected"} onClick={() => review("rejected")}>{busy === "rejected" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Mail aria-hidden="true" />}Gửi email yêu cầu bổ sung</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}

import { useRef, useState } from "react";
import { LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, useLoad } from "@/lib/api";
import type { Tutor, ProfileTheme, Subject } from "@/lib/types";
import { TutorProfileView } from "./tutor-profile-view";
import { TutorInventory } from "./tutor-inventory";
import { Button } from "./ui/button";
import { ErrorState, Loading } from "./common";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

export function TutorReviewDialog({ tutor, catalog, subjects, open, onOpenChange, onSaved, returnFocus }: {
  tutor: Tutor | null; catalog: ProfileTheme[]; subjects: Subject[]; open: boolean;
  onOpenChange: (open: boolean) => void; onSaved: () => void; returnFocus: () => void;
}) {
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const detail = useLoad<Tutor>(tutor ? `/admin/tutors/${tutor.user_id}/preview` : null);
  const title = useRef<HTMLHeadingElement>(null);
  async function review() {
    if (!tutor) return;
    setBusy("approved"); setError("");
    try {
      await api(`/admin/tutors/${tutor.user_id}`, "PATCH", { status: "approved", revision: detail.data?.review_revision ?? tutor.review_revision });
      onOpenChange(false); onSaved();
      toast.success("Đã duyệt và công bố hồ sơ");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) { setError(""); onOpenChange(value); } }}>
    <DialogContent className="tutor-review-dialog" closeDisabled={!!busy} aria-busy={!!busy} onOpenAutoFocus={e => { e.preventDefault(); title.current?.focus({ preventScroll: true }); }} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }} onCloseAutoFocus={e => { e.preventDefault(); returnFocus(); }}>
      <DialogHeader><DialogTitle ref={title} tabIndex={-1}>Xem & duyệt hồ sơ</DialogTitle><DialogDescription>Giao diện học sinh</DialogDescription></DialogHeader>
      <div className="tutor-review-body">{detail.loading ? <Loading /> : detail.error ? <ErrorState error={detail.error} retry={detail.reload} /> : detail.data && <TutorProfileView tutor={detail.data} subjects={subjects} preview />}
        {tutor && <details className="review-inventory"><summary>Kho giao diện</summary><TutorInventory key={tutor.user_id} tutor={tutor} catalog={catalog} /></details>}
      </div>
      <div className="tutor-review-actions">
        <span className="sr-only" role="status">{busy ? "Đang duyệt hồ sơ" : ""}</span>
        {error && <ErrorState error={error} />}
        <div className="actions"><Button disabled={!!busy || !detail.data || !!detail.error} onClick={() => review()}>{busy === "approved" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}Duyệt & công bố</Button>
          {tutor?.email && <Button variant="outline" asChild><a href={`https://mail.giasudiem10.online/compose?${new URLSearchParams({ template: "giasu-review", to: tutor.email, name: tutor.name })}`} target="_blank" rel="noopener noreferrer"><Mail aria-hidden="true" />Soạn email trong Mailflare</a></Button>}</div>
      </div>
    </DialogContent>
  </Dialog>;
}

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ConfirmDialog({ title, description, confirm, danger = false, busy, onConfirm, onCancel }: {
  title: string; description: string; confirm: string; danger?: boolean; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Hủy</Button>
        <Button type="button" variant={danger ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>{confirm}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

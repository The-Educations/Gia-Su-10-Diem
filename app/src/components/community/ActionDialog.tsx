import { useState } from "react";
import { toast } from "sonner";
import { api, useApp } from "@/lib/api";
import { Choose, ErrorState, Submit } from "@/components/common";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export type CommunityAction = {
  title: string;
  path: string;
  method: string;
  body?: Record<string, unknown>;
  reasonField?: "note" | "reason" | "resolution";
  report?: boolean;
  profileReport?: boolean;
};
export default function ActionDialog({
  action,
  close,
  done,
}: {
  action: CommunityAction;
  close: () => void;
  done?: () => void;
}) {
  const { refresh } = useApp();
  const [part, setPart] = useState("avatar");
  const [reason, setReason] = useState("Quảng cáo"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action.title}</DialogTitle>
          <DialogDescription>
            {action.report
              ? "Quản trị viên sẽ xem xét báo cáo của bạn."
              : "Xác nhận thao tác với nội dung này."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const fields = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const response = await api<{ email_status?: string }>(action.path, action.method, {
                ...action.body,
                ...fields,
                ...(action.report ? { reason } : {}),
                ...(action.profileReport ? { part } : {}),
              });
              refresh();
              if (response.email_status && response.email_status !== "sent") toast.warning("Đã xử lý nội dung. Email chưa gửi được; mở Quản trị cộng đồng để gửi lại.");
              else toast.success(response.email_status === "sent" ? "Đã xử lý và gửi email thông báo" : "Đã thực hiện");
              done?.();
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            {action.profileReport && <Choose label="Phần cần báo cáo" value={part} onChange={setPart} options={[{ value:"avatar", label:"Ảnh đại diện" },{ value:"cover", label:"Ảnh bìa" },{ value:"bio", label:"Giới thiệu" }]} />}
            {action.report && (
              <Choose
                label="Lý do báo cáo"
                value={reason}
                onChange={setReason}
                options={[
                  "Quảng cáo",
                  "Thông tin liên hệ",
                  "Xúc phạm",
                  "Không liên quan học tập",
                  "Khác",
                ].map((v) => ({ value: v, label: v }))}
              />
            )}
            {(action.reasonField || action.report) && (
              <Field>
                <FieldLabel htmlFor="community-action-note">
                  {action.report ? "Ghi chú (không bắt buộc)" : "Lý do"}
                </FieldLabel>
                <Textarea
                  id="community-action-note"
                  name={action.report ? "detail" : action.reasonField}
                  maxLength={action.report ? 300 : 1000}
                  required={!action.report}
                  rows={3}
                />
              </Field>
            )}
            {error && <ErrorState error={error} />}
            <Submit busy={busy}>
              {action.report ? "Gửi báo cáo" : "Xác nhận"}
            </Submit>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

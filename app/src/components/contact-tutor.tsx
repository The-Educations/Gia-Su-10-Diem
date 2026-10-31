import { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { api, useApp } from "@/lib/api";
import type { Tutor } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Field, FieldLabel } from "./ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Submit, ErrorState } from "./common";
export function ContactTutor({ tutor }: { tutor: Tutor }) {
  const { user } = useApp(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    [open, setOpen] = useState(
      params.get("contact") === "1" && user?.role === "student",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  if (user && user.role !== "student") return null;
  function contact() {
    if (!user) {
      navigate(
        `/auth?next=${encodeURIComponent(`/tutors/${tutor.user_id}?contact=1`)}`,
      );
      return;
    }
    setOpen(true);
  }
  async function send(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: number }>("/inquiries", "POST", {
        tutor_id: tutor.user_id,
        body: new FormData(e.currentTarget).get("body"),
      });
      navigate(`/messages?inquiry=${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button ref={trigger} onClick={contact}>
        <MessageCircle data-icon="inline-start" />
        Liên hệ gia sư
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && params.has("contact")) {
            const p = new URLSearchParams(params);
            p.delete("contact");
            setParams(p, { replace: true });
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nhắn cho {tutor.name}</DialogTitle>
            <DialogDescription>
              Trao đổi mục tiêu và lịch phù hợp trước khi đặt buổi học.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={send} className="contact-form">
            <Field>
              <FieldLabel htmlFor="inquiry-body">Lời nhắn của bạn</FieldLabel>
              <Textarea
                id="inquiry-body"
                name="body"
                placeholder="Em đang học lớp…, muốn tìm gia sư môn… vào buổi…"
                maxLength={3000}
                required
              />
            </Field>
            {error && <ErrorState error={error} />}
            <Submit busy={busy}>Gửi lời nhắn</Submit>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

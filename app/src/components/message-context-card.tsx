import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, FileText, Reply } from "lucide-react";
import type { MessageContext } from "@/lib/types";
import { contextActions, contextDetail, contextHref, contextLabels } from "@/lib/message-context";
import { Button } from "./ui/button";

export function MessageContextCard({ context, onReply }: { context: MessageContext; onReply?: () => void }) {
  const Icon = context.kind === "offer" ? FileText : CalendarDays;
  return <article className="message-context" data-slot="message-context" aria-label={`${contextLabels[context.kind]} #${context.id}`}>
    <Link className="message-context-link" to={contextHref(context)}>
      <Icon size={18} aria-hidden="true" />
      <div><strong>{contextLabels[context.kind]} #{context.id} · {context.subject_name}</strong>
        <span>{contextDetail(context)} · Giờ VN</span>
        <span className="message-context-action">{contextActions[context.kind]}<ArrowUpRight size={14} aria-hidden="true" /></span>
      </div>
    </Link>
    {onReply && <Button type="button" variant="ghost" size="sm" onClick={onReply} aria-label={`Trả lời về ${contextLabels[context.kind].toLowerCase()} #${context.id}`}><Reply size={14} aria-hidden="true" />Trả lời</Button>}
  </article>;
}

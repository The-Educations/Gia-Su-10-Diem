import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, FileText, Reply } from "lucide-react";
import type { MessageContext } from "@/lib/types";
import { contextActions, contextDetail, contextHref, contextLabels } from "@/lib/message-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";

export function MessageContextCard({ context, onReply }: { context: MessageContext; onReply?: () => void }) {
  const { t } = useI18n();
  const Icon = context.kind === "offer" ? FileText : CalendarDays;
  return <article className="message-context" data-slot="message-context" aria-label={`${contextLabels[context.kind]} #${context.id}`}>
    <Link className="message-context-link" to={contextHref(context)}>
      <Icon size={18} aria-hidden="true" />
      <div><strong>{t(contextLabels[context.kind])} #{context.id} · {context.subject_name}</strong>
        <span>{contextDetail(context, t)} · {t("Giờ VN")}</span>
        <span className="message-context-action">{t(contextActions[context.kind])}<ArrowUpRight size={14} aria-hidden="true" /></span>
      </div>
    </Link>
    {onReply && <Button type="button" variant="ghost" size="sm" onClick={onReply} aria-label={`${t("Trả lời về")} ${t(contextLabels[context.kind].toLowerCase())} #${context.id}`}><Reply size={14} aria-hidden="true" />{t("Trả lời")}</Button>}
  </article>;
}

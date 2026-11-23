import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CheckCheck,
  MessageCircle,
  MessagesSquare,
  Send,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, useApp } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { CommunityNotice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

type Notice = {
  id: number;
  kind: string;
  actor_name: string;
  subject: string;
  link: string;
  created_at: string;
  read_at: string | null;
};
type Row = {
  key: string;
  source: "app" | "community";
  id: number;
  text: string;
  link: string;
  icon: LucideIcon;
  created_at: string;
  unread: boolean;
};

// Vietnamese templates; the English versions live in the locale file.
const templates: Record<string, [string, LucideIcon]> = {
  offer_new: ["{actor} gửi đề nghị học {subject}", BookOpen],
  offer_accepted: ["{actor} đã nhận đề nghị học {subject}", BookOpen],
  offer_declined: ["{actor} đã từ chối đề nghị học {subject}", BookOpen],
  offer_cancelled: ["{actor} đã hủy đề nghị học {subject}", BookOpen],
  lesson_accepted: ["{actor} đã xác nhận buổi học {subject}", CalendarDays],
  lesson_declined: ["{actor} đã từ chối buổi học {subject}", CalendarDays],
  lesson_cancelled: ["{actor} đã hủy buổi học {subject}", CalendarDays],
  message_new: ["{actor} nhắn tin cho bạn", MessageCircle],
  profile_approved: ["Hồ sơ gia sư của bạn đã được công bố", BadgeCheck],
  profile_rejected: ["Hồ sơ gia sư của bạn cần bổ sung", BadgeCheck],
  credential_approved: ["“{subject}” đã được xác minh", BadgeCheck],
  credential_rejected: ["“{subject}” cần bổ sung minh chứng", BadgeCheck],
  proposal_new: ["{actor} gửi bạn đề nghị {subject}", Send],
  proposal_accepted: ["{actor} đã nhận đề nghị {subject}", Send],
  proposal_declined: ["{actor} đã từ chối đề nghị {subject}", Send],
  proposal_withdrawn: ["{actor} đã rút đề nghị {subject}", Send],
  deposit_received: ["Đã nhận {money} vào số dư", Wallet],
  verification_submitted: ["{actor} gửi học bạ chờ xác minh", BadgeCheck],
  verification_approved: ["Tài khoản học sinh của bạn đã được xác minh", BadgeCheck],
  verification_rejected: ["Hồ sơ xác minh cần bổ sung: {subject}", BadgeCheck],
  family_linked: ["{actor} đã liên kết với tài khoản của bạn", BadgeCheck],
  pitch_new: ["{actor} gửi hồ sơ vào bài “{subject}”", Send],
  dispute_resolved: ["Quản trị viên đã xử lý báo cáo ở lớp {subject}", CalendarDays],
  session_confirm: ["{actor} đã xác nhận buổi {subject}, bạn xác nhận giúp nhé", CalendarDays],
  session_remind: ["{actor} nhắc bạn xác nhận buổi {subject}", CalendarDays],
  session_cancelled: ["{actor} đã hủy một buổi {subject}", CalendarDays],
  session_move: ["{actor} đề nghị dời một buổi {subject}", CalendarDays],
  session_moved: ["{actor} đã đồng ý dời buổi {subject}", CalendarDays],
  session_move_declined: ["{actor} chưa đồng ý dời buổi {subject}", CalendarDays],
  session_disputed: ["{actor} báo vấn đề ở lớp {subject}", CalendarDays],
  material_new: ["{actor} thêm bài giảng “{subject}”", BookOpen],
  renew_reminder: ["{actor} nhắc gia hạn lớp {subject}", BookOpen],
  package_renewed: ["{actor} đã gia hạn {subject} buổi", BookOpen],
  package_ending: ["{actor} đã kết thúc gói học sớm", BookOpen],
  package_ended: ["Gói học đã kết thúc. Bạn có thể để lại nhận xét", BookOpen],
  package_settled: ["Đã chuyển {money} học phí vào số dư", Wallet],
  withdrawal_requested: ["{actor} yêu cầu rút {money}", Wallet],
  withdrawal_paid: ["Đã chuyển {money} bạn yêu cầu rút", Wallet],
  withdrawal_rejected: ["Yêu cầu rút {money} chưa được duyệt", Wallet],
};
const communityTemplates: Record<string, string> = {
  profile_removed: "Nội dung hồ sơ cộng đồng đã được gỡ",
  post_approved: "Bài “{title}” đã được duyệt",
  post_rejected: "Bài “{title}” bị từ chối",
  revision_approved: "Bản sửa của “{title}” đã được duyệt",
  revision_rejected: "Bản sửa của “{title}” bị từ chối",
  post_hidden: "Bài “{title}” đã bị ẩn",
  new_comment: "Có bình luận mới ở “{title}”",
};
const POLL_MS = 60000;

export function NotificationBell() {
  const { user, revision, refresh } = useApp(),
    { t, ago } = useI18n(),
    loc = useLocation(),
    [count, setCount] = useState(0),
    [open, setOpen] = useState(false),
    [rows, setRows] = useState<Row[] | null>(null),
    [unreadOnly, setUnreadOnly] = useState(false);
  const active = !!user && !user.email_verification_required;

  const loadCount = useCallback(() => {
    if (!active || document.visibilityState !== "visible") return;
    Promise.all([
      api<{ count: number }>("/notifications/unread-count"),
      api<{ count: number }>("/community/notifications/unread-count"),
    ])
      .then(([a, b]) => setCount(a.count + b.count))
      .catch(() => {});
  }, [active]);

  useEffect(() => {
    loadCount();
    const timer = setInterval(loadCount, POLL_MS);
    document.addEventListener("visibilitychange", loadCount);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", loadCount);
    };
  }, [loadCount, revision, loc.pathname]);

  useEffect(() => {
    if (!open || !active) return;
    let live = true;
    Promise.all([
      api<Notice[]>("/notifications"),
      api<CommunityNotice[]>("/community/notifications"),
    ])
      .then(([app, community]) => {
        if (!live) return;
        const merged: Row[] = [
          ...app.map((n) => {
            const [template, icon] = templates[n.kind] || ["{actor}", Bell];
            return {
              key: `a${n.id}`,
              source: "app" as const,
              id: n.id,
              text: t(n.kind === "message_new" && !n.actor_name ? "Hỗ trợ Gia Sư 10 Điểm nhắn tin cho bạn" : template, { actor: n.actor_name, subject: n.subject, money: /^\d+$/.test(n.subject) ? new Intl.NumberFormat("vi-VN").format(Number(n.subject)) + "đ" : "" }),
              link: n.link,
              icon,
              created_at: n.created_at,
              unread: !n.read_at,
            };
          }),
          ...community.map((n) => ({
            key: `c${n.id}`,
            source: "community" as const,
            id: n.id,
            text: t(communityTemplates[n.kind] || "{title}", { title: n.title || "" }),
            link: n.kind === "profile_removed" ? `/community/members/${user!.profile_code}` : `/community/${n.post_id}`,
            icon: MessagesSquare,
            created_at: n.created_at,
            unread: !n.read_at,
          })),
        ].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setRows(merged);
      })
      .catch((e) => {
        if (live) {
          setRows([]);
          toast.error((e as Error).message);
        }
      });
    return () => {
      live = false;
    };
  }, [open, active, revision]);

  async function markRead(row?: Row) {
    try {
      if (row) {
        if (!row.unread) return;
        await api(row.source === "app" ? "/notifications/read" : "/community/notifications/read", "POST", { id: row.id });
      } else
        await Promise.all([
          api("/notifications/read", "POST", { all: true }),
          api("/community/notifications/read", "POST", { all: true }),
        ]);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!active) return null;
  const shown = (rows || []).filter((r) => !unreadOnly || r.unread);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="notification-trigger"
          aria-label={count ? t("Thông báo, {count} chưa đọc", { count }) : t("Thông báo")}
        >
          <Bell aria-hidden="true" />
          {count > 0 && (
            <span className="notification-count" aria-hidden="true" key={count}>
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="notification-panel" align="end" sideOffset={8} aria-label={t("Thông báo")}>
        <header>
          <h2>{t("Thông báo")}</h2>
          <Button variant="ghost" size="sm" disabled={!count} onClick={() => markRead()}>
            <CheckCheck data-icon="inline-start" />
            {t("Đánh dấu đã đọc")}
          </Button>
        </header>
        <div className="notification-filter" role="group" aria-label={t("Lọc thông báo")}>
          <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
            {t("Tất cả")}
          </button>
          <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
            {t("Chưa đọc")}
          </button>
        </div>
        {!rows ? (
          <div className="notification-loading" role="status" aria-label={t("Đang tải")}>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !shown.length ? (
          <p className="notification-empty">{t(unreadOnly ? "Bạn đã đọc hết thông báo" : "Chưa có thông báo")}</p>
        ) : (
          <ul className="notification-list">
            {shown.map((row) => {
              const Icon = row.icon;
              return (
                <li key={row.key}>
                  <Link
                    to={row.link}
                    data-unread={row.unread || undefined}
                    onClick={() => {
                      void markRead(row);
                      setOpen(false);
                    }}
                  >
                    <span className="notification-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="notification-text">
                      {row.text}
                      <time dateTime={row.created_at}>{ago(row.created_at)}</time>
                    </span>
                    {row.unread && <span className="notification-dot" aria-label={t("Chưa đọc")} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

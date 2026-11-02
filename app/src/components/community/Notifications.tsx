import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad, dateTime } from "@/lib/api";
import type { CommunityNotice } from "@/lib/types";
import { Blank, ErrorState, Loading } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function CommunityUnread() {
  const { user, revision } = useApp(),
    loc = useLocation();
  const [state, setState] = useState({ user: 0, count: 0 });
  useEffect(() => {
    if (!user || user.email_verification_required) return;
    let active = true;
    const load = () => {
      if (document.visibilityState === "visible")
        api<{ count: number }>("/community/notifications/unread-count")
          .then((d) => {
            if (active) setState({ user: user.id, count: d.count });
          })
          .catch(() => {});
    };
    load();
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", load);
    };
  }, [
    user?.id,
    user?.email_verification_required,
    revision,
    loc.pathname,
    loc.search,
  ]);
  return user && state.user === user.id && state.count > 0 ? (
    <Badge
      className="community-unread"
      aria-label={`${state.count} thông báo chưa đọc`}
    >
      {state.count}
    </Badge>
  ) : null;
}
const names: Record<string, string> = {
  post_approved: "Bài đã được duyệt",
  post_rejected: "Bài bị từ chối",
  revision_approved: "Bản sửa đã được duyệt",
  revision_rejected: "Bản sửa bị từ chối",
  post_hidden: "Bài đã bị ẩn",
  new_comment: "Có bình luận mới",
};
export function Notifications() {
  const { user, refresh } = useApp(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const result = useLoad<CommunityNotice[]>(
    user && open ? "/community/notifications" : null,
  );
  async function read(body: { id?: number; all?: boolean }) {
    setBusy(true);
    try {
      await api("/community/notifications/read", "POST", body);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!user) return null;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="Thông báo cộng đồng"
      >
        <Bell data-icon="inline-start" />
        Thông báo
        <CommunityUnread />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="community-compose">
          <DialogHeader>
            <DialogTitle>Thông báo cộng đồng</DialogTitle>
            <DialogDescription className="sr-only">
              Kết quả duyệt bài và bình luận mới
            </DialogDescription>
          </DialogHeader>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => read({ all: true })}
          >
            Đánh dấu đã đọc tất cả
          </Button>
          {result.loading ? (
            <Loading />
          ) : result.error ? (
            <ErrorState error={result.error} retry={result.reload} />
          ) : !result.data?.length ? (
            <Blank title="Chưa có thông báo" />
          ) : (
            <div className="community-notifications">
              {result.data.map((n) => (
                <Link
                  key={n.id}
                  to={`/community/${n.post_id}`}
                  onClick={() => {
                    void read({ id: n.id });
                    setOpen(false);
                  }}
                >
                  <span>
                    {!n.read_at && (
                      <span className="community-dot" aria-label="Chưa đọc" />
                    )}
                    {names[n.kind]}
                  </span>
                  <strong>{n.title}</strong>
                  <time>{dateTime(n.created_at)}</time>
                </Link>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

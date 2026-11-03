import { Link, NavLink } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useApp, useLoad } from "@/lib/api";
import type { CommunityIdentity } from "@/lib/types";
import { ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthorLabel } from "./shared";
import { CommunityUnread, Notifications } from "./Notifications";

export default function CommunityWorkspace() {
  const { user } = useApp();
  const identity = useLoad<CommunityIdentity>(user ? "/community/me" : null);
  if (!user) return null;
  return (
    <section
      className="community-workspace"
      aria-label="Không gian cộng đồng của bạn"
    >
      <div className="community-workspace-identity">
        <div>
          <span className="community-identity-label">Hiển thị công khai</span>
          {identity.loading ? (
            <span role="status">Đang tải…</span>
          ) : identity.error ? (
            <ErrorState error={identity.error} retry={identity.reload} />
          ) : (
            identity.data && <AuthorLabel author={identity.data.author} />
          )}
        </div>
        <Notifications />
      </div>
      <nav
        className="community-workspace-nav"
        aria-label="Điều hướng cộng đồng"
      >
        <NavLink to="/community" end>
          Thảo luận
        </NavLink>
        <NavLink to="/community/mine">
          Bài của tôi <CommunityUnread />
        </NavLink>
        <NavLink to={`/community/members/${user.profile_code}`}>Hồ sơ</NavLink>
        {user.role === "admin" && (
          <Button asChild size="sm">
            <Link to="/admin?tab=community">
              <ShieldCheck data-icon="inline-start" />
              Quản lý cộng đồng
            </Link>
          </Button>
        )}
      </nav>
      {!!user.community_locked && (
        <Alert>
          <AlertDescription>
            Quyền đăng bài đang bị khóa: {user.community_lock_reason}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

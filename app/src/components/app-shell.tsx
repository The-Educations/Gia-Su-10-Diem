import { useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ArrowUpRight, Clock3, LogIn, LogOut, Menu, PanelLeft, Settings, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { accountRole, type CommunityIdentity } from "@/lib/types";
import type { NavItem, NavModel } from "@/lib/navigation";
import { Person } from "@/components/common";
import { timezoneLabel } from "@/components/tutor-timezone";
import { memberImageUrl } from "@/components/community/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function Brand({ to, onClick }: { to: string; onClick?: () => void }) {
  return (
    <Link className="brand" to={to} aria-label="Gia Sư 10 Điểm" title="Gia Sư 10 Điểm" onClick={onClick} translate="no">
      <span className="brand-mark" aria-hidden="true">10<span>đ</span></span>
      <span className="nav-label">Gia Sư<strong>10 Điểm</strong></span>
    </Link>
  );
}

function Links({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const { t } = useI18n(), { user } = useApp();
  const counts = useLoad<{ waiting: number }>(user?.role === "admin" && items.some((i) => i.badge === "sessions") ? "/admin/sessions/summary" : null).data;
  return items.map(({ to, label, icon: Icon, badge }) => (
    <NavLink key={to} to={to} aria-label={t(label)} title={t(label)} onClick={onNavigate}>
      <Icon aria-hidden="true" />
      <span className="nav-label">{t(label)}</span>
      {badge === "sessions" && counts?.waiting ? <em className="nav-badge" aria-label={t("{n} việc cần xử lý", { n: counts.waiting })}>{counts.waiting}</em> : null}
    </NavLink>
  ));
}

function NavLists({ model, onNavigate }: { model: NavModel; onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("Điều hướng chính")}>
      <Links items={model.primary} onNavigate={onNavigate} />
      {model.groups.map((group) => (
        <div className="nav-group" key={group.label} role="group" aria-label={t(group.label)}>
          <span className="nav-group-label nav-label" aria-hidden="true">{t(group.label)}</span>
          <Links items={group.items} onNavigate={onNavigate} />
        </div>
      ))}
    </nav>
  );
}

function useLogout() {
  const { setUser, refresh } = useApp(),
    { t } = useI18n(),
    navigate = useNavigate();
  return async () => {
    try {
      await api("/auth/logout", "POST");
      setUser(null);
      refresh();
      navigate("/tutors");
      toast.success(t("Đã đăng xuất"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
}

function useAvatar() {
  const { user } = useApp();
  const identity = useLoad<CommunityIdentity>(user && !user.email_verification_required ? "/community/me" : null);
  return identity.data?.author.has_avatar ? memberImageUrl(identity.data.author, "avatar") : undefined;
}

function AccountSummary() {
  const { user } = useApp(),
    { t } = useI18n(),
    avatar = useAvatar();
  if (!user) return null;
  return (
    <>
      <Person name={user.name} id={user.id} src={avatar} />
      <span className="nav-label account-summary">
        <strong>{user.name}</strong>
        <small>{t(accountRole(user))}</small>
        <small className="account-timezone">
          <Clock3 size={12} aria-hidden="true" />
          {timezoneLabel(user.timezone, true)}
        </small>
      </span>
    </>
  );
}

function AccountLinks({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useApp(),
    { t } = useI18n(),
    logout = useLogout();
  if (!user) return null;
  return (
    <>
      <Link to={`/community/members/${user.profile_code}`} onClick={onNavigate}>
        <UserRound aria-hidden="true" />
        {t("Xem hồ sơ của tôi")}
      </Link>
      <Link to="/settings" onClick={onNavigate}>
        <Settings aria-hidden="true" />
        {t("Cài đặt tài khoản")}
      </Link>
      <a href="/">
        <ArrowUpRight aria-hidden="true" />
        {t("Về trang giới thiệu")}
      </a>
      <button
        type="button"
        className="account-logout"
        onClick={() => {
          onNavigate();
          void logout();
        }}
      >
        <LogOut aria-hidden="true" />
        {t("Đăng xuất")}
      </button>
    </>
  );
}

function AccountMenu() {
  const { user } = useApp(),
    { t } = useI18n(),
    [open, setOpen] = useState(false),
    navigating = useRef(false);
  if (!user) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="account-link" aria-label={`${t("Tài khoản")}: ${user.name}`} title={user.name}>
          <AccountSummary />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="account-menu"
        side="top"
        align="start"
        aria-label={t("Tài khoản")}
        onCloseAutoFocus={(event) => {
          if (navigating.current) {
            event.preventDefault();
            navigating.current = false;
          }
        }}
      >
        <AccountLinks
          onNavigate={() => {
            navigating.current = true;
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function Sidebar({
  model,
  collapsed,
  onToggle,
}: {
  model: NavModel;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { user } = useApp(),
    { t } = useI18n(),
    label = t(collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng");
  return (
    <aside className="sidebar" id="desktop-navigation" aria-label={t("Thanh điều hướng")}>
      <div className="sidebar-header">
        <Brand to={model.home} />
        <Button
          className="sidebar-toggle"
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          aria-expanded={!collapsed}
          aria-controls="desktop-navigation"
          onClick={onToggle}
        >
          <PanelLeft aria-hidden="true" />
        </Button>
      </div>
      <NavLists model={model} />
      <div className="sidebar-bottom">
        {user ? (
          <AccountMenu />
        ) : (
          <Button asChild className="sidebar-action">
            <Link to="/auth" aria-label={t("Tài khoản")} title={t("Tài khoản")}>
              <LogIn data-icon="inline-start" />
              <span className="nav-label">{t("Tài khoản")}</span>
            </Link>
          </Button>
        )}
      </div>
    </aside>
  );
}

// The phone's bottom bar; its last button opens every destination in a sheet.
export function MobileBar({
  model,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  model: NavModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const { user } = useApp(),
    { t } = useI18n(),
    close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <nav className="mobile-bar" aria-label={t("Điều hướng nhanh")}>
        {model.bar.map(({ to, label, short, icon: Icon }) => (
          <NavLink key={to} to={to} aria-label={t(label)}>
            <Icon aria-hidden="true" />
            <span aria-hidden="true">{t(short || label)}</span>
          </NavLink>
        ))}
        <SheetTrigger asChild>
          <button type="button">
            <Menu aria-hidden="true" />
            <span>{t("Thêm")}</span>
          </button>
        </SheetTrigger>
      </nav>
      <SheetContent side="bottom" className="navigation-sheet" onCloseAutoFocus={onCloseAutoFocus}>
        <SheetTitle className="sr-only">{t("Điều hướng")}</SheetTitle>
        <SheetDescription className="sr-only">Gia Sư 10 Điểm</SheetDescription>
        <div className="mobile-nav">
          {user ? (
            <div className="mobile-account">
              <AccountSummary />
            </div>
          ) : (
            <Button asChild className="sidebar-action">
              <Link to="/auth" onClick={close}>
                <LogIn data-icon="inline-start" />
                {t("Tài khoản")}
              </Link>
            </Button>
          )}
          <NavLists model={model} onNavigate={close} />
          <div className="mobile-nav-footer">
            {user ? (
              <div className="account-menu-links">
                <AccountLinks onNavigate={close} />
              </div>
            ) : (
              <a href="/" className="landing-link">
                <ArrowUpRight aria-hidden="true" />
                {t("Về trang giới thiệu")}
              </a>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

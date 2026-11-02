import { CommunityUnread } from "./components/community/Notifications";
import { timezoneLabel } from "./components/tutor-timezone";
import { accountRole } from "@/lib/types";
import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Routes,
  Route,
  NavLink,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AnimateUIProvider } from "@animate-ui/react/provider";
import {
  Clock3,
  BookOpen,
  Newspaper,
  Users,
  CalendarDays,
  MessageCircle,
  MessagesSquare,
  Heart,
  House,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  PanelLeft,
  LogIn,
  ArrowUpRight,
} from "lucide-react";
import { AppProvider, useApp, api, accountDestination } from "./lib/api";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "./components/ui/sheet";
import { Person, Loading, ErrorState } from "./components/common";
import { toast } from "sonner";
import { ErrorBoundary } from "./components/error-boundary";
import "./styles.css";
import { PageMetadata } from "./components/page-metadata";
const Availability = lazy(() => import("./pages/Availability"));
const Tutors = lazy(() => import("./pages/Tutors"));
const TutorDetail = lazy(() => import("./pages/TutorDetail"));
const Community = lazy(() => import("./pages/Community"));
const CommunityPost = lazy(() => import("./pages/CommunityPost"));
const CommunityWrite = lazy(() => import("./pages/CommunityWrite"));
const CommunityMine = lazy(() => import("./pages/CommunityMine"));
const News = lazy(() => import("./pages/News"));
const Library = lazy(() => import("./pages/Library"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Messages = lazy(() => import("./pages/Messages"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const TutorCalendar = lazy(() => import("./pages/TutorCalendar"));
const TutorStudio = lazy(() => import("./pages/TutorStudio"));
const Admin = lazy(() => import("./pages/Admin"));

function Require({
  role,
  children,
}: {
  role?: string;
  children: React.ReactNode;
}) {
  const { user, loading, authError, retryAuth } = useApp(),
    loc = useLocation();
  if (loading) return <Loading />;
  if (authError) return <ErrorState error={authError} retry={retryAuth} />;
  if (!user)
    return (
      <Navigate
        to={`/auth?next=${encodeURIComponent(loc.pathname + loc.search)}`}
        replace
      />
    );
  if (user.email_verification_required)
    return <Navigate to={accountDestination(user, loc.pathname + loc.search)} replace />;
  if (user.role !== "admin" && user.onboarding_step < 3 && loc.pathname !== "/onboarding")
    return <Navigate to={accountDestination(user, loc.pathname + loc.search)} replace />;
  if (role && user.role !== role) return <Navigate to="/workspace" replace />;
  return children;
}
function Shell() {
  const { user, setUser, refresh } = useApp(),
    loc = useLocation(),
    [open, setOpen] = useState(false),
    [collapsed, setCollapsed] = useState(() => {
      try { return localStorage.getItem("giasu.sidebar.collapsed") === "true"; }
      catch { return false; }
    });
  useEffect(() => {
    try { localStorage.setItem("giasu.sidebar.collapsed", String(collapsed)); }
    catch { /* Navigation still works when storage is unavailable. */ }
  }, [collapsed]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 951px)");
    const closeMobileNavigation = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeMobileNavigation);
    return () => desktop.removeEventListener("change", closeMobileNavigation);
  }, []);
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus();
  }, [loc.pathname]);
  const nav = [
    ...(user
      ? [
          {
            to: user.role === "admin" ? "/admin" : "/workspace",
            label: user.role === "admin" ? "Quản trị" : "Tổng quan",
            icon: user.role === "admin" ? ShieldCheck : House,
          },
          {
            to: user.role === "student" ? "/bookings" : "/calendar",
            label:
              user.role === "admin"
                ? "Lịch dạy"
                : user.role === "tutor"
                  ? "Lịch dạy"
                  : user.learner_type === "parent" ? "Lịch học của con" : "Lịch học của tôi",
            icon: CalendarDays,
          },
          {
            to: "/messages",
            label: "Tin nhắn",
            icon: MessageCircle,
          },
        ]
      : []),
    ...(user?.role === "tutor"
      ? [{ to: "/studio", label: "Hồ sơ gia sư", icon: Settings }]
      : []),
    ...(user?.role === "student"
      ? [{ to: "/availability", label: "Lịch rảnh", icon: CalendarDays }, { to: "/favorites", label: "Gia sư đã lưu", icon: Heart }]
      : []),
    { to: "/tutors", label: "Tìm gia sư", icon: Users },
    { to: "/library", label: "Tìm môn học", icon: BookOpen },
    { to: "/community", label: "Cộng đồng", icon: MessagesSquare },
    { to: "/news", label: "Tin tức", icon: Newspaper },
  ];
  const navigation = (
    <>
      <div className="sidebar-header">
        <Link className="brand" to={user ? user.role === "admin" ? "/admin" : "/workspace" : "/tutors"} aria-label="Gia Sư 10 Điểm" title="Gia Sư 10 Điểm" onClick={() => setOpen(false)}>
          <span className="brand-mark">10<span>đ</span></span>
          <span className="nav-label">Gia Sư<br /><strong>10 Điểm</strong></span>
        </Link>
        <Button
          className="sidebar-toggle"
          variant="ghost"
          size="icon"
          aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          aria-expanded={!collapsed}
          aria-controls="desktop-navigation"
          onClick={() => setCollapsed((value) => !value)}
        >
          <PanelLeft aria-hidden="true" />
          <span className="nav-label">Thu gọn</span>
        </Button>
      </div>
      <nav aria-label="Điều hướng chính">
        {nav.map(({ to, label, icon: Icon }) => (
          <React.Fragment key={to}>
          {user && to === "/tutors" && <div className="nav-divider" aria-hidden="true" />}
          <NavLink to={to} aria-label={label} title={label} onClick={() => setOpen(false)}>
            <Icon size={19} aria-hidden="true" />
            <span className="nav-label">{label}</span>
            {to === "/community" && <CommunityUnread />}
          </NavLink>
          </React.Fragment>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <a href="/" className="landing-link" aria-label="Về trang giới thiệu" title="Về trang giới thiệu">
          <ArrowUpRight size={19} aria-hidden="true" />
          <span className="nav-label">Về trang giới thiệu</span>
        </a>
        {user ? (
          <>
            <Link to="/settings" className="account-link" aria-label={`Cài đặt tài khoản: ${user.name}`} title={`${user.name} · ${timezoneLabel(user.timezone, true)}`} onClick={() => setOpen(false)}>
              <Person name={user.name} id={user.id} />
              <span className="nav-label">
                <strong>{user.name}</strong>
                <small>{accountRole(user)}</small>
                <small className="account-timezone"><Clock3 size={12} aria-hidden="true" />{timezoneLabel(user.timezone, true)}</small>
              </span>
            </Link>
            <Button
              variant="ghost"
              className="sidebar-action"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              onClick={async () => {
                try {
                  await api("/auth/logout", "POST");
                  setUser(null);
                  refresh();
                  toast.success("Đã đăng xuất");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <LogOut data-icon="inline-start" />
              <span className="nav-label">Đăng xuất</span>
            </Button>
          </>
        ) : (
          <Button asChild className="sidebar-action">
            <Link to="/auth" aria-label="Tài khoản" title="Tài khoản" onClick={() => setOpen(false)}>
              <LogIn data-icon="inline-start" />
              <span className="nav-label">Tài khoản</span>
            </Link>
          </Button>
        )}
      </div>
    </>
  );
  return (
    <div className="app-shell" data-role={user?.role || "guest"} data-sidebar-collapsed={collapsed}>
      <PageMetadata />
      <a href="#main" className="skip-link">
        Đến nội dung
      </a>
      <aside className="sidebar" id="desktop-navigation" aria-label="Thanh điều hướng">{navigation}</aside>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-leading">
          <div className="mobile-brand">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mở điều hướng">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="navigation-sheet">
                <SheetTitle className="sr-only">Điều hướng</SheetTitle>
                <SheetDescription className="sr-only">
                  Gia Sư 10 Điểm
                </SheetDescription>
                <div className="mobile-nav">{navigation}</div>
              </SheetContent>
            </Sheet>
            <Link to="/tutors">10 Điểm</Link>
          </div>
          <span className="topbar-location">
            {(loc.pathname.startsWith("/community") ? "Cộng đồng" : nav.find((n) => n.to === loc.pathname)?.label) || "Gia Sư 10 Điểm"}
          </span>
          </div>
          <div className="topbar-right">
            {user?.demo && (
              <span className="demo-indicator">Tài khoản mẫu</span>
            )}
            {user && <Person name={user.name} id={user.id} />}
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <ErrorBoundary key={loc.pathname}>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/tutors" replace />} />
                <Route path="/tutors" element={<Tutors />} />
                <Route path="/tutors/:id" element={<TutorDetail />} />
                <Route path="/community" element={<Community />} />
              <Route path="/community/write" element={<Require><CommunityWrite /></Require>} />
              <Route path="/community/mine" element={<Require><CommunityMine /></Require>} />
              <Route path="/community/:id" element={<CommunityPost />} />
              <Route path="/news" element={<News />} />
                <Route path="/news/:id" element={<News />} />
                <Route path="/library" element={<Library />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/onboarding" element={<Require><Onboarding /></Require>} />
                <Route
                  path="/workspace"
                  element={
                    <Require>
                      <Dashboard />
                    </Require>
                  }
                />
                <Route
                  path="/bookings"
                  element={
                    <Require>
                      <Bookings />
                    </Require>
                  }
                />
                <Route
                  path="/messages"
                  element={
                    <Require>
                      <Messages />
                    </Require>
                  }
                />
                <Route
                  path="/favorites"
                  element={
                    <Require role="student">
                      <Tutors favoritesOnly />
                    </Require>
                  }
                />
                <Route path="/calendar" element={<Require><TutorCalendar /></Require>} />
                <Route path="/availability" element={<Require role="student"><Availability /></Require>} />
                <Route
                  path="/settings"
                  element={
                    <Require>
                      <SettingsPage />
                    </Require>
                  }
                />
                <Route
                  path="/studio"
                  element={
                    <Require role="tutor">
                      <TutorStudio />
                    </Require>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <Require role="admin">
                      <Admin />
                    </Require>
                  }
                />
                <Route
                  path="*"
                  element={
                    <div className="page">
                      <h1>Không tìm thấy trang</h1>
                      <Link to="/tutors">Về tìm gia sư</Link>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        <footer className="app-footer">
          <span>Gia Sư 10 Điểm</span>
          <nav aria-label="Thông tin pháp lý"><a href="/privacy">Quyền riêng tư</a><a href="/terms">Điều khoản dịch vụ</a></nav>
        </footer>
      </div>
    </div>
  );
}
const router = createBrowserRouter([{ path: "*", element:
  <AnimateUIProvider>
    <AppProvider>
      <Shell />
      <Toaster richColors position="top-right" />
    </AppProvider>
  </AnimateUIProvider>,
}], { basename: "/app" });
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>,
);

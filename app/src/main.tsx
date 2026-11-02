import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AnimateUIProvider } from "@animate-ui/react/provider";
import {
  BookOpen,
  Users,
  CalendarDays,
  MessageCircle,
  Heart,
  House,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
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
const Tutors = lazy(() => import("./pages/Tutors"));
const TutorDetail = lazy(() => import("./pages/TutorDetail"));
const Library = lazy(() => import("./pages/Library"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Messages = lazy(() => import("./pages/Messages"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const TutorStudio = lazy(() => import("./pages/TutorStudio"));
const Admin = lazy(() => import("./pages/Admin"));
const roles = { student: "Học sinh", tutor: "Gia sư", admin: "Quản trị viên" };
const VN_ZONE = "Asia/Ho_Chi_Minh";
function zoneClock(zone: string, now: Date) {
  const offset =
    new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "UTC") || "";
  return {
    offset: offset === "UTC" ? "UTC+0" : offset,
    time: new Intl.DateTimeFormat("vi-VN", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
  };
}
function TimeZones() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const vn = zoneClock(VN_ZONE, now);
  let local: ReturnType<typeof zoneClock> | null = null,
    place = "";
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && zone !== VN_ZONE) {
      local = zoneClock(zone, now);
      place = zone.split("/").pop()!.replace(/_/g, " ");
    }
  } catch {
    local = null;
  }
  return (
    <>
      <span className="time-zone">
        {vn.time} · Giờ Việt Nam · {vn.offset}
      </span>
      {local && local.offset !== vn.offset && (
        <span className="time-zone">
          {local.time} · {place} · {local.offset}
        </span>
      )}
    </>
  );
}
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
  if (user.role !== "admin" && user.onboarding_step < 3 && loc.pathname !== "/onboarding")
    return <Navigate to={accountDestination(user, loc.pathname + loc.search)} replace />;
  if (role && user.role !== role) return <Navigate to="/workspace" replace />;
  return children;
}
function Shell() {
  const { user, loading, setUser, refresh } = useApp(),
    loc = useLocation(),
    [open, setOpen] = useState(false);
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
            to: "/bookings",
            label:
              user.role === "admin"
                ? "Quản lý buổi học"
                : user.role === "tutor"
                  ? "Lịch dạy & yêu cầu"
                  : "Lịch học của tôi",
            icon: CalendarDays,
          },
          {
            to: "/messages",
            label: user.role === "admin" ? "Hội thoại buổi học" : "Tin nhắn",
            icon: MessageCircle,
          },
        ]
      : []),
    ...(user?.role === "tutor"
      ? [{ to: "/studio", label: "Hồ sơ & giờ trống", icon: Settings }]
      : []),
    ...(user?.role === "student"
      ? [{ to: "/favorites", label: "Gia sư đã lưu", icon: Heart }]
      : []),
    { to: "/tutors", label: "Tìm gia sư", icon: Users },
    { to: "/library", label: "Môn học & kỳ thi", icon: BookOpen },
  ];
  const navigation = (
    <>
      <Link className="brand" to="/tutors">
        <span className="brand-mark">
          10<span>đ</span>
        </span>
        <span>
          Gia Sư
          <br />
          <strong>10 Điểm</strong>
        </span>
      </Link>
      {user && (
        <div className="workspace-role">
          <span />
          {roles[user.role]}
        </div>
      )}
      <nav aria-label="Điều hướng chính">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}>
            <Icon size={19} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <a href="/" className="landing-link">
          Về trang giới thiệu
          <ArrowUpRight size={16} />
        </a>
        {user ? (
          <>
            <Link to="/settings" className="account-link">
              <Person name={user.name} id={user.id} />
              <span>
                <strong>{user.name}</strong>
                <small>{roles[user.role]}</small>
              </span>
            </Link>
            <Button
              variant="ghost"
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
              Đăng xuất
            </Button>
          </>
        ) : (
          <Button asChild>
            <Link to="/auth">Đăng nhập</Link>
          </Button>
        )}
      </div>
    </>
  );
  return (
    <div className="app-shell" data-role={user?.role || "guest"}>
      <a href="#main" className="skip-link">
        Đến nội dung
      </a>
      <aside className="sidebar">{navigation}</aside>
      <div className="app-body">
        <header className="topbar">
          <div className="mobile-brand">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mở điều hướng">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
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
            {nav.find((n) => n.to === loc.pathname)?.label || "Gia Sư 10 Điểm"}
          </span>
          <div className="topbar-right">
            <TimeZones />
            {user?.demo && (
              <span className="demo-indicator">Tài khoản mẫu</span>
            )}
            {user ? (
              <Person name={user.name} id={user.id} />
            ) : (
              !loading && (
                <Button asChild variant="outline">
                  <Link to="/auth?mode=register">
                    Tạo tài khoản
                    <ArrowUpRight data-icon="inline-end" />
                  </Link>
                </Button>
              )
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <ErrorBoundary key={loc.pathname}>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/tutors" replace />} />
                <Route path="/tutors" element={<Tutors />} />
                <Route path="/tutors/:id" element={<TutorDetail />} />
                <Route path="/library" element={<Library />} />
                <Route path="/auth" element={<Auth />} />
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
        </footer>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/app">
      <AnimateUIProvider>
        <AppProvider>
          <Shell />
          <Toaster richColors position="top-right" />
        </AppProvider>
      </AnimateUIProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

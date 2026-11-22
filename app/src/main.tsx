import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AnimateUIProvider } from "@animate-ui/react/provider";
import { AppProvider, useApp, accountDestination } from "./lib/api";
import { Toaster } from "./components/ui/sonner";
import { Loading, ErrorState } from "./components/common";
import { I18nProvider, useI18n } from "./lib/i18n";
import { LanguageSwitch } from "./components/language-switch";
import { RequestStrip } from "./components/request-strip";
import { ErrorBoundary } from "./components/error-boundary";
import { NotificationBell } from "./components/notification-bell";
import { Brand, MobileBar, Sidebar } from "./components/app-shell";
import { allItems, navigationFor } from "./lib/navigation";
import { finishBoot } from "./lib/boot";
import "./styles.css";
import "./shell.css";
import { PageMetadata } from "./components/page-metadata";
const Offers = lazy(() => import("./pages/Offers"));
const Availability = lazy(() => import("./pages/Availability"));
const Tutors = lazy(() => import("./pages/Tutors"));
const TutorDetail = lazy(() => import("./pages/TutorDetail"));
const CommunityProfile = lazy(() => import("./pages/CommunityProfile"));
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
  const { user } = useApp(),
    { t } = useI18n(),
    loc = useLocation(),
    [open, setOpen] = useState(false),
    [collapsed, setCollapsed] = useState(() => {
      try { return localStorage.getItem("giasu.sidebar.collapsed") === "true"; }
      catch { return false; }
    });
  const navigationOpenedAt = useRef(loc.pathname);
  // The exiting sheet retains its previous props until its animation finishes.
  const currentPath = useRef(loc.pathname);
  useEffect(() => {
    try { localStorage.setItem("giasu.sidebar.collapsed", String(collapsed)); }
    catch { /* Navigation still works when storage is unavailable. */ }
  }, [collapsed]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeMobileNavigation = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeMobileNavigation);
    return () => desktop.removeEventListener("change", closeMobileNavigation);
  }, []);
  useEffect(() => {
    currentPath.current = loc.pathname;
    setOpen(false);
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [loc.pathname]);
  useEffect(finishBoot, []);
  const model = navigationFor(user),
    title = loc.pathname.startsWith("/community") ? "Cộng đồng" : allItems(model).find((n) => n.to === loc.pathname)?.label || "Gia Sư 10 Điểm";
  return (
    <div className="app-shell" data-auth-page={loc.pathname === "/auth" || undefined} data-role={user?.role || "guest"} data-sidebar-collapsed={collapsed}>
      <PageMetadata />
      <a href="#main" className="skip-link">
        {t("Đến nội dung")}
      </a>
      <Sidebar model={model} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-leading">
            <span className="mobile-brand"><Brand to={model.home} /></span>
            <span className="topbar-location">{t(title)}</span>
          </div>
          {user && <RequestStrip role={user.role === "admin" ? null : user.role} />}
          <div className="topbar-right">
            {user?.demo && (
              <span className="demo-indicator">{t("Tài khoản mẫu")}</span>
            )}
            <LanguageSwitch />
            <NotificationBell />
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <ErrorBoundary key={loc.pathname}>
            <div className="route-stage">
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/tutors" replace />} />
                <Route path="/tutors" element={<Tutors />} />
                <Route path="/tutors/:id" element={<TutorDetail />} />
                <Route path="/community" element={<Community />} />
              <Route path="/community/write" element={<Require><CommunityWrite /></Require>} />
              <Route path="/community/mine" element={<Require><CommunityMine /></Require>} />
              <Route path="/community/members/:code" element={<Require><CommunityProfile /></Require>} />
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
                <Route path="/offers" element={<Require><Offers /></Require>} />
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
                      <h1>{t("Không tìm thấy trang")}</h1>
                      <Link to="/tutors">{t("Về tìm gia sư")}</Link>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
            </div>
          </ErrorBoundary>
        </main>
        <footer className="app-footer">
          <span>Gia Sư 10 Điểm</span>
          <nav aria-label={t("Thông tin pháp lý")}><a href="/privacy">{t("Quyền riêng tư")}</a><a href="/terms">{t("Điều khoản dịch vụ")}</a></nav>
        </footer>
      </div>
      <MobileBar
        model={model}
        open={open}
        onOpenChange={(next) => {
          if (next) navigationOpenedAt.current = loc.pathname;
          setOpen(next);
        }}
        onCloseAutoFocus={(event) => {
          if (navigationOpenedAt.current !== currentPath.current || window.matchMedia("(min-width: 1024px)").matches) {
            event.preventDefault();
            document.getElementById("main")?.focus({ preventScroll: true });
          }
        }}
      />
    </div>
  );
}
const router = createBrowserRouter([{ path: "*", element:
  <AnimateUIProvider>
    <I18nProvider>
      <AppProvider>
        <Shell />
        <Toaster richColors position="top-right" />
      </AppProvider>
    </I18nProvider>
  </AnimateUIProvider>,
}], { basename: "/app" });
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>,
);

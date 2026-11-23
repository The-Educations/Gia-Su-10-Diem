import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation, useSearchParams,
} from "react-router-dom";
import { AnimateUIProvider } from "@animate-ui/react/provider";
import { AppProvider, useApp, accountDestination } from "./lib/api";
import { WalletProvider } from "./lib/wallet";
import { Toaster } from "./components/ui/sonner";
import { Loading, ErrorState, Page } from "./components/common";
import { Button } from "./components/ui/button";
import { I18nProvider, useI18n } from "./lib/i18n";
import { BROWSE, setupSkipped } from "./lib/setup";
import { LanguageSwitch } from "./components/language-switch";
import { RequestStrip } from "./components/request-strip";
import { ErrorBoundary } from "./components/error-boundary";
import { NotificationBell } from "./components/notification-bell";
import { BalanceChip } from "./components/balance-chip";
import { Brand, MobileBar, Sidebar } from "./components/app-shell";
import { SocialLinks } from "./components/social-links";
import { allItems, navigationFor } from "./lib/navigation";
import { finishBoot } from "./lib/boot";
import "./styles.css";
import "./shell.css";
import { PageMetadata } from "./components/page-metadata";
const Proposals = lazy(() => import("./pages/Proposals"));
const WalletPage = lazy(() => import("./pages/Wallet"));
const Schedule = lazy(() => import("./pages/Schedule"));
const SessionsPage = lazy(() => import("./pages/SessionsPage"));
const FamilyPage = lazy(() => import("./pages/Family"));
const ClassList = lazy(() => import("./pages/Classes").then((m) => ({ default: m.ClassList })));
const ClassDetail = lazy(() => import("./pages/Classes").then((m) => ({ default: m.ClassDetail })));
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
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Messages = lazy(() => import("./pages/Messages"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const TutorCalendar = lazy(() => import("./pages/TutorCalendar"));
const TutorStudio = lazy(() => import("./pages/TutorStudio"));
const Admin = lazy(() => import("./pages/Admin"));

// Retired flows keep their paths as redirects: /bookings and /offers land on
// the replacement pages per role; a link to one old offer opens the new
// proposals list.
function LegacyRedirect({ from }: { from: "bookings" | "offers" }) {
  const { user } = useApp(), loc = useLocation(), [params] = useSearchParams();
  if (user?.role === "admin") return <Navigate to={`/app/sessions${loc.search}`} replace />;
  if (from === "offers" && params.get("id")) return <Navigate to={`/app/proposals${loc.search}`} replace />;
  return <Navigate to={`/app/classes${loc.search}`} replace />;
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
  if (user.email_verification_required)
    return <Navigate to={accountDestination(user, loc.pathname + loc.search)} replace />;
  if (user.role !== "admin" && user.onboarding_step < 3 && loc.pathname !== "/onboarding") {
    if (!setupSkipped()) return <Navigate to={accountDestination(user, loc.pathname + loc.search)} replace />;
    if (!BROWSE.some((re) => re.test(loc.pathname))) return <SetupRequired />;
  }
  if (role && user.role !== role) return <Navigate to="/workspace" replace />;
  return children;
}
function SetupRequired() {
  const { t } = useI18n();
  return (
    <Page>
      <section className="setup-required">
        <h1>{t("Hoàn tất thiết lập để dùng tính năng này")}</h1>
        <p>{t("Chọn vai trò và điền thông tin cơ bản, chỉ mất một phút.")}</p>
        <Button asChild><Link to="/onboarding">{t("Thiết lập tài khoản")}</Link></Button>
      </section>
    </Page>
  );
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
    title = loc.pathname.startsWith("/community") ? "Cộng đồng" : (allItems(model).find((n) => n.to === loc.pathname) || allItems(model).find((n) => loc.pathname.startsWith(n.to + "/")))?.label || "Gia Sư 10 Điểm";
  return (
    <div className="app-shell" data-auth-page={loc.pathname === "/auth" || undefined} data-setup={["/onboarding", "/verify-email"].includes(loc.pathname) || undefined} data-role={user?.role || "guest"} data-sidebar-collapsed={collapsed}>
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
            <BalanceChip />
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
                <Route path="/news/:idSlug" element={<News />} />
                <Route path="/library" element={<Library />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
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
                  path="/sessions"
                  element={
                    <Require>
                      <SessionsPage />
                    </Require>
                  }
                />
                <Route
                  path="/bookings"
                  element={
                    <Require>
                      <LegacyRedirect from="bookings" />
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
                <Route path="/offers" element={<Require><LegacyRedirect from="offers" /></Require>} />
                <Route path="/proposals" element={<Require><Proposals /></Require>} />
                <Route path="/wallet" element={<Require><WalletPage /></Require>} />
                <Route path="/schedule" element={<Require><Schedule /></Require>} />
                <Route path="/family" element={<Require role="student"><FamilyPage /></Require>} />
                <Route path="/classes" element={<Require><ClassList /></Require>} />
                <Route path="/classes/:id" element={<Require><ClassDetail /></Require>} />
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
          <span>{t("Gia Sư 10 Điểm")}</span>
          <SocialLinks />
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
        <WalletProvider>
          <Shell />
        </WalletProvider>
        <Toaster richColors position="top-right" />
      </AppProvider>
    </I18nProvider>
  </AnimateUIProvider>,
}], { basename: "/app" });
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>,
);

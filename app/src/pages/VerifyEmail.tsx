import { SignupCode } from "@/components/signup-code";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { MailCheck, Mail } from "lucide-react";
import { api, useApp, accountDestination } from "@/lib/api";
import type { User } from "@/lib/types";
import { Page, Loading, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";

export default function VerifyEmail() {
  const { user, setUser, loading, authError, retryAuth } = useApp();
  const [params] = useSearchParams(), navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState(location.state?.deliveryFailed ? "Chưa gửi được email. Vui lòng thử gửi lại sau một phút." : "");
  const [confirmed, setConfirmed] = useState(false), [verifiedUser, setVerifiedUser] = useState<User | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const incoming = new URLSearchParams(location.hash.slice(1));
    if (!incoming.has("token")) return;
    setToken(incoming.get("token") || "");
    setConfirmed(false); setError(""); setSent(false);
    navigate(location.pathname + location.search, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);
  if (loading) return <Loading />;
  if (authError) return <ErrorState error={authError} retry={retryAuth} />;
  async function confirm() {
    setBusy(true); setError("");
    try {
      const result = await api<{ user: User | null }>("/auth/verify-email", "POST", { token });
      if (result.user) setUser(result.user);
      setVerifiedUser(result.user); setConfirmed(true);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError("");
    try { await api("/auth/resend-verification", "POST", {}); setSent(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function continueSetup() {
    setBusy(true); setError("");
    try {
      if (verifiedUser || (user && !user.email_verification_required)) {
        navigate(accountDestination(verifiedUser || user!, params.get("next")), { replace: true }); return;
      }
      if (user) { await api("/auth/logout", "POST", {}); setUser(null); }
      navigate("/auth", { replace: true });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (!user && !token && !confirmed) return <SignupCode />;
  return <Page><section className="account-entry verification-entry">
    {confirmed ? <MailCheck size={32} aria-hidden="true" /> : <Mail size={32} aria-hidden="true" />}
    <h1>{confirmed ? "Email đã được xác nhận" : "Xác nhận email của bạn"}</h1>
    {error && <ErrorState error={error} />}
    {confirmed || (user && !user.email_verification_required && !token) ?
      <Button disabled={busy} onClick={() => void continueSetup()}>Tiếp tục</Button> : <>
      {token ? <Button disabled={busy || confirmed} onClick={() => void confirm()}>{busy ? "Đang xác nhận…" : "Xác nhận email"}</Button> :
        <p>Mở liên kết từ <strong>contact@giasudiem10.online</strong>{user ? <> được gửi tới <strong>{user.email}</strong></> : " trong hộp thư của bạn"} để hoàn tất tài khoản.</p>}
      {user?.email_verification_required && <Button variant="outline" disabled={busy} onClick={() => void resend()}>{busy ? "Đang xử lý…" : "Gửi lại email xác nhận"}</Button>}
      {user?.email_verification_required && !token && <Button variant="ghost" disabled={busy} onClick={retryAuth}>Tôi đã xác nhận email</Button>}
      {sent && <p role="status">Đã gửi email mới. Kiểm tra cả thư mục Spam.</p>}
      {!user && <Button asChild variant="outline"><Link to="/auth">Đăng nhập</Link></Button>}
    </>}
  </section></Page>;
}

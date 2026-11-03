import { GoogleSignIn, googleErrors } from "@/components/google-sign-in";
import { useRef, useState } from "react";
import { Link, useSearchParams, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Mail } from "lucide-react";
import { api, useApp, accountDestination } from "@/lib/api";
import type { User } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorState, Submit, Loading } from "@/components/common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Auth() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const register = params.get("mode") === "register";
  const [emailOpen, setEmailOpen] = useState(params.has("mode"));
  const [busy, setBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(googleErrors[params.get("oauth_error") || ""] || "");
  const { user, loading, authError, retryAuth, setUser, refresh } = useApp();
  if (!loading && !authError && user) return <Navigate to={accountDestination(user, params.get("next"))} replace />;

  function requireConsent() {
    if (acceptedTerms) return true;
    setConsentError(true);
    consentRef.current?.focus();
    return false;
  }

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!requireConsent()) return;
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (register && data.password !== data.confirmPassword) {
      setError("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ user: User; pending?: boolean }>(`/auth/${register ? "register" : "login"}`, "POST", data);
      if (result.pending) { navigate(`/verify-email${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`); return; }
      setUser(result.user);
      refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="auth-layout">
    <aside className="auth-art-panel" aria-label="Gia Sư 10 Điểm">
      <a className="auth-brand" href="/" aria-label="Gia Sư 10 Điểm — Trang chủ">
        <span className="brand-mark" aria-hidden="true">10<span>đ</span></span>
        <span>Gia Sư<br /><strong>10 Điểm</strong></span>
      </a>
      <div className="auth-illustration" aria-hidden="true">
        <img src="/assets/auth-study.webp" alt="" width="1200" height="1200" fetchPriority="high" />
      </div>
      <Link className="auth-explore" to="/tutors">Tìm gia sư <ArrowUpRight aria-hidden="true" /></Link>
    </aside>
    <div className="auth-content-panel">
      <a className="auth-back" href="/"><ArrowLeft aria-hidden="true" />Về trang chủ</a>
      <div className="auth-content">
      {loading ? <Loading /> : authError ? <ErrorState error={authError} retry={retryAuth} /> :
    <section className="account-entry" aria-labelledby="account-title">
      <h1 id="account-title">{register ? "Tạo tài khoản" : "Chào mừng bạn."}</h1>
      <fieldset className="auth-policy">
        <legend>Trước khi tiếp tục</legend>
        <div className="auth-consent">
        <input ref={consentRef} id="account-consent" type="checkbox" form="account-email-form" required checked={acceptedTerms} disabled={busy}
          aria-invalid={consentError || undefined} aria-describedby={consentError ? "account-consent-error" : undefined}
          onInvalid={event => { event.preventDefault(); requireConsent(); }}
          onChange={event => { setAcceptedTerms(event.target.checked); setConsentError(false); }} />
        <label htmlFor="account-consent">Đồng ý <a href="/terms" target="_blank" rel="noopener noreferrer" aria-label="Điều khoản dịch vụ">Điều khoản</a> &amp; <a href="/privacy" target="_blank" rel="noopener noreferrer" aria-label="Chính sách quyền riêng tư">Quyền riêng tư</a>.</label>
      </div>
        {consentError && <p id="account-consent-error" className="auth-consent-error" role="alert">Vui lòng tích đồng ý Điều khoản và Quyền riêng tư để tiếp tục.</p>}
      </fieldset>
      <GoogleSignIn next={params.get("next")} disabled={busy} allowed={acceptedTerms} onBlocked={requireConsent} />
      <Button variant="ghost" size="lg" className="account-email-toggle" aria-expanded={emailOpen} aria-controls="email-account" disabled={busy} onClick={() => { if (!emailOpen) requireConsent(); setEmailOpen(value => !value); }}>
        <Mail aria-hidden="true" />Dùng email và mật khẩu
      </Button>
      {error && <ErrorState error={error} />}
      {emailOpen && <div id="email-account">
        <Tabs value={register ? "register" : "login"} onValueChange={mode => {
          setError("");
          const next = new URLSearchParams(params);
          next.set("mode", mode);
          next.delete("role");
          setParams(next, { replace: true });
        }}>
          <TabsList className="account-email-tabs">
            <TabsTrigger value="login">Đăng nhập</TabsTrigger>
            <TabsTrigger value="register">Tạo tài khoản</TabsTrigger>
          </TabsList>
        <TabsContent value={register ? "register" : "login"}>
        <form id="account-email-form" key={register ? "register" : "login"} onSubmit={submit}>
          <FieldGroup>
            {register && <Field>
              <FieldLabel htmlFor="name">Họ và tên</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required maxLength={80} />
            </Field>}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Mật khẩu{register ? " (ít nhất 10 ký tự)" : ""}</FieldLabel>
              <Input id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={10} maxLength={128} required />
            </Field>
            {register && <Field>
              <FieldLabel htmlFor="confirm-password">Xác nhận mật khẩu</FieldLabel>
              <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required />
            </Field>}
            <Submit busy={busy}>{register ? "Gửi mã xác minh" : "Đăng nhập"}<ArrowRight data-icon="inline-end" /></Submit>
          </FieldGroup>
        </form>
        </TabsContent>
        </Tabs>
      </div>}
    </section>}
      </div>
      <footer className="auth-footer">© {new Date().getFullYear()} Gia Sư 10 Điểm</footer>
    </div>
  </div>;
}

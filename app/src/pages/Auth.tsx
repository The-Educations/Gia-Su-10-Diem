import { GoogleSignIn, googleErrors } from "@/components/google-sign-in";
import { useState } from "react";
import { useSearchParams, Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Mail } from "lucide-react";
import { api, useApp, accountDestination } from "@/lib/api";
import type { User } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Page, ErrorState, Submit, Loading } from "@/components/common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Auth() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const register = params.get("mode") === "register";
  const [emailOpen, setEmailOpen] = useState(params.has("mode"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(googleErrors[params.get("oauth_error") || ""] || "");
  const { user, loading, authError, retryAuth, setUser, refresh } = useApp();
  if (loading) return <Loading />;
  if (authError) return <ErrorState error={authError} retry={retryAuth} />;
  if (user) return <Navigate to={accountDestination(user, params.get("next"))} replace />;

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
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

  return <Page>
    <section className="account-entry" aria-labelledby="account-title">
      <span className="brand-mark" aria-hidden="true">10<span>đ</span></span>
      <h1 id="account-title">Đăng nhập hoặc tạo tài khoản</h1>
      <GoogleSignIn next={params.get("next")} />
      <Button variant="ghost" className="account-email-toggle" aria-expanded={emailOpen} aria-controls="email-account" onClick={() => setEmailOpen(value => !value)}>
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
        <form key={register ? "register" : "login"} onSubmit={submit}>
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
      <p className="auth-policy">Khi tiếp tục, bạn đồng ý với <a href="/terms">Điều khoản dịch vụ</a> và đã đọc <a href="/privacy">Chính sách quyền riêng tư</a>.</p>
      <Link className="account-explore" to="/library">Khám phá môn học</Link>
    </section>
  </Page>;
}

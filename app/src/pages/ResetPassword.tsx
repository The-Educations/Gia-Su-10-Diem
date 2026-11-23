import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { KeyRound, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Page, ErrorState, Submit } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export default function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (data.password !== data.confirmPassword) { setError(t("Mật khẩu xác nhận chưa khớp.")); return; }
    setBusy(true);
    try { await api("/auth/reset-password", "POST", { token, password: data.password }); setDone(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <Page><section className="account-entry verification-entry" aria-labelledby="reset-title">
    <KeyRound size={32} aria-hidden="true" />
    <h1 id="reset-title">{t("Đặt mật khẩu mới")}</h1>
    {error && <ErrorState error={error} />}
    {done ? <>
      <p>{t("Mật khẩu đã được đổi. Mọi phiên đăng nhập cũ đã đăng xuất — hãy đăng nhập lại bằng mật khẩu mới.")}</p>
      <Link to="/auth" className="auth-back"><ArrowLeft aria-hidden="true" />{t("Đăng nhập")}</Link>
    </> : !token ? <>
      <p>{t("Liên kết đặt lại không hợp lệ. Hãy yêu cầu một liên kết mới.")}</p>
      <Link to="/forgot-password" className="auth-back"><ArrowLeft aria-hidden="true" />{t("Gửi lại liên kết")}</Link>
    </> : <>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">{t("Mật khẩu mới (ít nhất 10 ký tự)")}</FieldLabel>
            <div className="password-field">
              <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required />
              <Button type="button" variant="ghost" size="icon" aria-label={show ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")} onClick={() => setShow(v => !v)}>
                {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">{t("Xác nhận mật khẩu")}</FieldLabel>
            <Input id="confirm-password" name="confirmPassword" type={show ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required />
          </Field>
          <Submit busy={busy}>{t("Đổi mật khẩu")}</Submit>
        </FieldGroup>
      </form>
      <Link to="/forgot-password" className="auth-back"><ArrowLeft aria-hidden="true" />{t("Gửi lại liên kết")}</Link>
    </>}
  </section></Page>;
}

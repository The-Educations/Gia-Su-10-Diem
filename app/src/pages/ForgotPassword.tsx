import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Page } from "@/components/common";
import { ErrorState, Submit } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export default function ForgotPassword() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try { await api("/auth/forgot-password", "POST", data); setSent(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <Page><section className="account-entry verification-entry" aria-labelledby="forgot-title">
    <MailCheck size={32} aria-hidden="true" />
    <h1 id="forgot-title">{t("Đặt lại mật khẩu")}</h1>
    {error && <ErrorState error={error} />}
    {sent ? <>
      <p>{t("Nếu email này có tài khoản, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Liên kết dùng một lần và hết hạn sau 30 phút — hãy kiểm tra cả hộp thư rác.")}</p>
      <Link to="/auth" className="auth-back"><ArrowLeft aria-hidden="true" />{t("Về trang đăng nhập")}</Link>
    </> : <>
      <p>{t("Nhập email tài khoản của bạn. Nếu email tồn tại, chúng tôi sẽ gửi một liên kết đặt lại mật khẩu.")}</p>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">{t("Email")}</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
          </Field>
          <Submit busy={busy}>{t("Gửi liên kết đặt lại")}</Submit>
        </FieldGroup>
      </form>
      <Link to="/auth" className="auth-back"><ArrowLeft aria-hidden="true" />{t("Về trang đăng nhập")}</Link>
    </>}
  </section></Page>;
}

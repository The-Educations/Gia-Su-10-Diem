import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mail } from "lucide-react";
import { api, useLoad, useApp, accountDestination } from "@/lib/api";
import type { User } from "@/lib/types";
import { Page, Loading, ErrorState, Submit } from "./common";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Field, FieldLabel, FieldGroup } from "./ui/field";

export function SignupCode() {
  const pending = useLoad<{ pending: boolean; email: string }>("/auth/signup");
  const { setUser } = useApp();
  const navigate = useNavigate(), [params] = useSearchParams();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  const [error, setError] = useState(params.get("delivery") === "failed" ? "Chưa gửi được mã. Vui lòng thử gửi lại sau một phút." : "");
  async function verify(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ user: User; next: string }>("/auth/signup/verify", "POST", { code });
      setUser(result.user); navigate(accountDestination(result.user, result.next || params.get("next")), { replace: true });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError(""); setSent(false);
    try { await api("/auth/signup/resend", "POST", {}); setSent(true); setCode(""); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (pending.loading) return <Loading />;
  if (pending.error) return <ErrorState error={pending.error} retry={pending.reload} />;
  return <Page><section className="account-entry verification-entry">
    <Mail size={28} aria-hidden="true" /><h1>Xác minh email</h1>
    {pending.data?.pending ? <>
      <p>Mã 6 số đã gửi đến <strong>{pending.data.email}</strong></p>
      <p>Chưa thấy email trong hộp thư đến? Hãy kiểm tra thư mục Spam (Thư rác).</p>
      <form onSubmit={verify}><FieldGroup>
        <Field><FieldLabel htmlFor="signup-code">Mã xác minh</FieldLabel><Input id="signup-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoFocus required /></Field>
        {error && <ErrorState error={error} />}
        <Submit busy={busy} disabled={code.length !== 6}>Xác minh & tạo tài khoản</Submit>
      </FieldGroup></form>
      <Button variant="ghost" disabled={busy} onClick={() => void resend()}>Gửi lại mã</Button>
      {sent && <p role="status">Đã gửi mã mới.</p>}
    </> : <p>Phiên đăng ký đã hết hạn. Vui lòng bắt đầu lại.</p>}
    <Link to="/auth?mode=register">Quay lại đăng ký</Link>
  </section></Page>;
}

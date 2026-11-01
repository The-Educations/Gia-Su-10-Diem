import { GoogleSignIn, googleErrors } from "@/components/google-sign-in";
import { useState } from "react";
import { useNavigate, useSearchParams, Link, Navigate } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  MessageCircle,
} from "lucide-react";
import { api, useApp, accountDestination } from "@/lib/api";
import type { User } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Page, Choose, ErrorState, Submit } from "@/components/common";
export default function Auth() {
  const [params, setParams] = useSearchParams(),
    register = params.get("mode") === "register",
    navigate = useNavigate(),
    { user, setUser, refresh } = useApp();
  const [role, setRole] = useState(
      params.get("role") === "tutor" ? "tutor" : "student",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      googleErrors[params.get("oauth_error") || ""] || "",
    );
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (register && d.password !== d.confirmPassword) {
      setError("Mật khẩu xác nhận chưa khớp.");
      setBusy(false);
      return;
    }
    try {
      const result = await api<{ user: User }>(
        `/auth/${register ? "register" : "login"}`,
        "POST",
        register ? { ...d, role } : d,
      );
      setUser(result.user);
      refresh();
      navigate(accountDestination(result.user, params.get("next")), { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (user) return <Navigate to={accountDestination(user, params.get("next"))} replace />;
  return (
    <Page>
      <div className="auth-layout">
        <section className="auth-story">
          <span className="brand-mark">
            10<span>đ</span>
          </span>
          <h1>
            Một chỗ cho
            <br />
            <em>việc học của bạn.</em>
          </h1>
          <ul>
            <li>
              <BookOpen />
              Tìm gia sư theo môn và mục tiêu
            </li>
            <li>
              <CalendarDays />
              Chọn lịch phù hợp mỗi tuần
            </li>
            <li>
              <MessageCircle />
              Trao đổi trước và sau buổi học
            </li>
          </ul>
          <Link to="/tutors">
            Khám phá trước
            <ArrowUpRight size={18} />
          </Link>
        </section>
        <section className="auth-form">
          <h2>{register ? "Tạo tài khoản" : "Đăng nhập"}</h2>
          {register && (
            <Choose
              label="Bạn tham gia với vai trò"
              value={role}
              onChange={setRole}
              options={[
                { value: "student", label: "Học sinh / Phụ huynh" },
                { value: "tutor", label: "Gia sư" },
              ]}
            />
          )}
          <GoogleSignIn role={role} next={params.get("next")} />
          <form key={register ? "register" : "login"} onSubmit={submit}>
            <FieldGroup>
              {register && (
                <>
                  <Field>
                    <FieldLabel htmlFor="name">Họ và tên</FieldLabel>
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      maxLength={80}
                      required
                    />
                  </Field>
                </>
              )}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">
                  Mật khẩu{register ? " (ít nhất 10 ký tự)" : ""}
                </FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={10}
                  maxLength={128}
                  required
                />
              </Field>
              {register && <Field>
                <FieldLabel htmlFor="confirm-password">Xác nhận mật khẩu</FieldLabel>
                <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required />
              </Field>}
              {error && <ErrorState error={error} />}
              <Submit busy={busy}>
                {register ? "Tạo tài khoản" : "Đăng nhập"}
                <ArrowUpRight data-icon="inline-end" />
              </Submit>
            </FieldGroup>
          </form>
          <div className="auth-switch">
            {register ? "Đã có tài khoản?" : "Chưa có tài khoản?"}
            <Button
              variant="link"
              onClick={() => {
                setError("");
                const p = new URLSearchParams(params);
                p.set("mode", register ? "login" : "register");
                setParams(p);
              }}
            >
              {register ? "Đăng nhập" : "Đăng ký"}
            </Button>
          </div>
        </section>
      </div>
    </Page>
  );
}

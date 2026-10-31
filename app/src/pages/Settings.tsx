import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { api, useApp, useLoad } from "@/lib/api";
import type { User } from "@/lib/types";
import { Page, Heading, Submit, ErrorState } from "@/components/common";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
export default function Settings() {
  const methods = useLoad<{
    password: boolean;
    google: boolean;
    googleAvailable: boolean;
  }>("/account/auth-methods");
  const { user, setUser } = useApp(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function save(e: React.SubmitEvent<HTMLFormElement>, password = false) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(password ? "password" : "profile");
    setError("");
    try {
      const values = Object.fromEntries(new FormData(form));
      if (password) {
        await api("/account/password", "POST", values);
        form.reset();
      } else {
        const result = await api<{ user: User }>("/account", "PATCH", values);
        setUser(result.user);
      }
      toast.success(
        password
          ? "Đã đổi mật khẩu và đăng xuất các phiên khác"
          : "Đã lưu hồ sơ",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Page>
      <Heading title="Tài khoản của tôi" />
      {error && <ErrorState error={error} />}
      <section className="settings-section">
        <div>
          <h2>Thông tin cá nhân</h2>
          <p>{user?.email}</p>
        </div>
        <form onSubmit={(e) => save(e)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="account-name">Họ và tên</FieldLabel>
              <Input
                id="account-name"
                name="name"
                defaultValue={user?.name}
                required
                maxLength={80}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-goal">Mục tiêu học tập</FieldLabel>
              <Textarea
                id="account-goal"
                name="goal"
                defaultValue={user?.goal}
                maxLength={1000}
              />
            </Field>
            <Submit busy={busy === "profile"}>Lưu thông tin</Submit>
          </FieldGroup>
        </form>
      </section>
      <section className="settings-section">
        <div>
          <h2>Đăng nhập Google</h2>
        </div>
        <div>
          {methods.error ? (
            <ErrorState error={methods.error} retry={methods.reload} />
          ) : methods.data?.google ? (
            <p>Đã liên kết Google</p>
          ) : methods.data?.googleAvailable ? (
            <Button asChild variant="outline">
              <a href="/api/auth/google/start?intent=link">Liên kết Google</a>
            </Button>
          ) : (
            <p className="muted">Chưa bật đăng nhập Google</p>
          )}
        </div>
      </section>
      {methods.data?.password && (
        <section className="settings-section">
          <div>
            <h2>Đổi mật khẩu</h2>
            <p>Tối thiểu 10 ký tự.</p>
          </div>
          <form onSubmit={(e) => save(e, true)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="current">Mật khẩu hiện tại</FieldLabel>
                <Input
                  id="current"
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password">Mật khẩu mới</FieldLabel>
                <Input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                />
              </Field>
              <Submit busy={busy === "password"}>Đổi mật khẩu</Submit>
            </FieldGroup>
          </form>
        </section>
      )}
    </Page>
  );
}

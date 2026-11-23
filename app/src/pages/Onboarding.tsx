import { AddressFields } from "@/components/address-fields";
import { useRef, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, Users, GraduationCap, ArrowRight } from "lucide-react";
import { api, useApp, accountDestination } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { User } from "@/lib/types";
import { Page, ErrorState, Submit } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TimezoneField } from "@/components/tutor-timezone";
import { Button } from "@/components/ui/button";
import { skipSetup } from "@/lib/setup";

export default function Onboarding() {
  const { user, setUser, refresh } = useApp(), t = useI18n().t;
  const [params] = useSearchParams(), navigate = useNavigate();
  const [role, setRole] = useState("");
  const [address, setAddress] = useState({ province_code: user?.province_code || "", ward_code: user?.ward_code || "" });
  const [timezone, setTimezone] = useState(user!.timezone || "Asia/Ho_Chi_Minh");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const step = user!.onboarding_step;
  useEffect(() => { heading.current?.focus(); }, [step]);
  // A new tutor finishes onboarding by completing the profile; everyone else goes to their usual home.
  if (user!.role === "admin" || step === 3) return <Navigate to={user!.role === "tutor" && !params.get("next") ? "/studio" : accountDestination(user!, params.get("next"))} replace />;
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api<{ user: User }>("/account/onboarding", "PUT", { ...fields, step: step === 0 ? 0 : 1, role, timezone });
      setUser(result.user); refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Page><section className="account-entry setup-quick" aria-busy={busy}>
    <span className="brand-mark" aria-hidden="true">10<span>đ</span></span>
    <h1 ref={heading} tabIndex={-1}>{step === 0 ? t("Bạn muốn bắt đầu thế nào?") : t("Thông tin cơ bản")}</h1>
    <form onSubmit={save}><FieldGroup>
      {step === 0 ? <ToggleGroup type="single" orientation="vertical" spacing={2} variant="outline" value={role} onValueChange={v => { if (v) setRole(v); }} className="setup-roles" aria-label={t("Vai trò của bạn")}>
        <ToggleGroupItem value="student"><BookOpen aria-hidden="true" />{t("Học sinh")}</ToggleGroupItem>
        <ToggleGroupItem value="parent"><Users aria-hidden="true" />{t("Phụ huynh")}</ToggleGroupItem>
        <ToggleGroupItem value="tutor"><GraduationCap aria-hidden="true" />{t("Gia sư")}</ToggleGroupItem>
      </ToggleGroup> : <>
        <Field><FieldLabel htmlFor="setup-name">{t("Họ và tên")}</FieldLabel><Input id="setup-name" name="name" defaultValue={user!.name} autoComplete="name" required maxLength={80} /></Field>
        <Field><FieldLabel htmlFor="setup-display-name">{t("Tên hiển thị trong cộng đồng")}</FieldLabel><Input id="setup-display-name" name="display_name" defaultValue={user!.display_name || user!.name.trim().split(/\s+/).at(-1)} required minLength={2} maxLength={30} /></Field>
        {user!.role === "student" && <>
          <Field><FieldLabel htmlFor="setup-school">{user!.learner_type === "parent" ? t("Trường của con") : t("Trường đang học")}</FieldLabel><Input id="setup-school" name="school" defaultValue={user!.school} required maxLength={160} /></Field>
          <AddressFields value={address} onChange={setAddress} />
        </>}
        <TimezoneField value={timezone} onChange={setTimezone} />
        {user!.role === "student" && <Field><FieldLabel htmlFor="setup-goal">{user!.learner_type === "parent" ? t("Mục tiêu học tập của con (tùy chọn)") : t("Mục tiêu học tập (tùy chọn)")}</FieldLabel><Input id="setup-goal" name="goal" defaultValue={user!.goal} maxLength={1000} /></Field>}
      </>}
      {error && <ErrorState error={error} />}
      <Submit busy={busy} disabled={step === 0 && !role}>{step === 0 ? t("Tiếp tục") : t("Bắt đầu")}<ArrowRight data-icon="inline-end" /></Submit>
    </FieldGroup></form>
    {/* Browsing is open before setup; booking, messages and money wait for it. */}
    <Button variant="ghost" className="setup-later" onClick={() => { skipSetup(); navigate("/tutors"); }}>{t("Để sau, xem gia sư trước")}</Button>
  </section></Page>;
}

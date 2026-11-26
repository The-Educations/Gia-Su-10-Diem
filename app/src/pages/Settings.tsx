import { StudentCode } from "@/pages/Family";
import { StudentVerification } from "@/components/student-verification";
import { Link, useSearchParams } from "react-router-dom";
import { Bell, ShieldCheck, UserRound, Users, BadgeCheck, type LucideIcon } from "lucide-react";
import { AddressFields } from "@/components/address-fields";
import { TimezoneField } from "@/components/tutor-timezone";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, useApp, useLoad } from "@/lib/api";
import type { User } from "@/lib/types";
import { Page, Heading, Submit, ErrorState, Person } from "@/components/common";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
type Section = "profile" | "verify" | "family" | "security" | "notifications";
const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Hồ sơ", icon: UserRound },
  { id: "verify", label: "Xác minh học sinh", icon: BadgeCheck },
  { id: "family", label: "Gia đình", icon: Users },
  { id: "security", label: "Bảo mật", icon: ShieldCheck },
  { id: "notifications", label: "Thông báo", icon: Bell },
];
const BELL_LABELS = { proposals: "Chuông đề nghị", money: "Chuông tiền", lessons: "Chuông buổi học", community: "Chuông cộng đồng", children: "Chuông việc học của con" } as const;
const EMAIL_TOPICS: { id: keyof typeof BELL_LABELS; label: string }[] = [
  { id: "proposals", label: "Đề nghị học mới và câu trả lời" },
  { id: "money", label: "Tiền vào số dư và rút tiền" },
  { id: "lessons", label: "Buổi học cần xác nhận" },
  { id: "community", label: "Cộng đồng: bài viết, bình luận hoặc hồ sơ bị ẩn, gỡ" },
  { id: "children", label: "Việc học của con" },
];

// Email for the events that matter; in-app notices are always on.
function NotificationSettings({ parent }: { parent: boolean }) {
  const { t } = useI18n();
  // Only parent accounts receive notices about a child, so only they see that switch.
  const topics = EMAIL_TOPICS.filter((topic) => parent || topic.id !== "children");
  const prefs = useLoad<{ email: Record<string, boolean>; bell: Record<string, boolean> }>("/account/notifications"),
    [saving, setSaving] = useState("");
  if (prefs.error) return <ErrorState error={prefs.error} retry={prefs.reload} />;
  async function toggle(group: "email" | "bell", id: string, value: boolean) {
    setSaving(group === "bell" ? `bell-${id}` : id);
    try { await api("/account/notifications", "PUT", { [group]: { [id]: value } }); prefs.reload(); toast.success("Đã lưu"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(""); }
  }
  return (
    <section className="settings-card" aria-labelledby="notify-title">
      <h2 id="notify-title">{t("Gửi email cho tôi khi có")}</h2>
      <ul className="settings-switches">
        {topics.map((topic) => (
          <li key={topic.id}>
            <label htmlFor={`notify-${topic.id}`}>{topic.label}</label>
            <input id={`notify-${topic.id}`} type="checkbox" role="switch" className="switch" disabled={!prefs.data || saving === topic.id}
              checked={prefs.data?.email?.[topic.id] ?? true} onChange={(e) => toggle("email", topic.id, e.target.checked)} />
          </li>
        ))}
      </ul>
      <h2>{t("Hiện trên chuông khi có")}</h2>
      <ul className="settings-switches">
        {topics.map((topic) => (
          <li key={`bell-${topic.id}`}>
            <label htmlFor={`bell-${topic.id}`}>{topic.label} · {t("chuông")}</label>
            <input id={`bell-${topic.id}`} type="checkbox" role="switch" className="switch" aria-label={t(BELL_LABELS[topic.id])} disabled={!prefs.data || saving === `bell-${topic.id}`}
              checked={prefs.data?.bell?.[topic.id] ?? true} onChange={(e) => toggle("bell", topic.id, e.target.checked)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Settings() {
  const { t } = useI18n();
  const methods = useLoad<{
    password: boolean;
    google: boolean;
    googleAvailable: boolean;
  }>("/account/auth-methods");
  const { user, setUser, refresh } = useApp(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [address, setAddress] = useState({ province_code: user?.province_code || "", ward_code: user?.ward_code || "" });
  const [timezone, setTimezone] = useState(user?.timezone || "Asia/Ho_Chi_Minh");
  const [params, setParams] = useSearchParams();
  const student = user?.role === "student" && user.learner_type !== "parent", parent = user?.learner_type === "parent";
  const sections = SECTIONS.filter((s) => (s.id === "verify" ? student : s.id === "family" ? user?.role === "student" : true));
  const section = sections.find((s) => s.id === params.get("section"))?.id || "profile";
  useEffect(() => { document.querySelector(".settings-nav [aria-current]")?.scrollIntoView({ block: "nearest", inline: "center" }); }, [section]);
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
        refresh();
        if (user?.role === "tutor" && result.user.name !== user.name) {
          toast.success("Đã đổi tên. Hồ sơ gia sư đang chờ duyệt lại.");
          return;
        }
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
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Mục cài đặt">
          {sections.map(({ id, label, icon: Icon }) => (
            <button type="button" key={id} aria-current={section === id ? "page" : undefined} onClick={() => setParams(id === "profile" ? {} : { section: id }, { replace: true })}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-panel">
          {error && <ErrorState error={error} />}
          {section === "profile" && (
            <>
              <header className="settings-who">
                <Person name={user?.name || ""} id={user?.id} large />
                <div><strong>{user?.name}</strong><span>{user?.email}</span></div>
                <Link className="text-link" to={`/community/members/${user?.profile_code}`}>{t("Hồ sơ cộng đồng của tôi")}</Link>
              </header>
              <form className="settings-card" onSubmit={(e) => save(e)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="account-name">{t("Họ và tên")}</FieldLabel>
                    <Input id="account-name" name="name" defaultValue={user?.name} required maxLength={80} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="account-goal">{parent ? "Mục tiêu học tập của con" : "Mục tiêu học tập"}</FieldLabel>
                    <Textarea id="account-goal" name="goal" defaultValue={user?.goal} maxLength={1000} />
                  </Field>
                  {user?.role === "student" && <>
                    <Field><FieldLabel htmlFor="account-school">{parent ? "Trường của con" : "Trường đang học"}</FieldLabel><Input id="account-school" name="school" defaultValue={user.school} required maxLength={160} /></Field>
                    <AddressFields value={address} onChange={setAddress} />
                  </>}
                  <TimezoneField value={timezone} onChange={setTimezone} />
                  <Submit busy={busy === "profile"}>{t("Lưu thông tin")}</Submit>
                </FieldGroup>
              </form>
            </>
          )}
          {section === "verify" && <StudentVerification />}
          {section === "family" && (parent
            ? <section className="settings-card"><h2>{t("Con của tôi")}</h2><p className="muted">{t("Xem lịch học, lớp và số dư của con, hoặc liên kết thêm con bằng mã 6 ký tự.")}</p><Button asChild variant="outline"><Link to="/family">{t("Mở trang Con của tôi")}</Link></Button></section>
            : <StudentCode />)}
          {section === "security" && (
            <>
              <section className="settings-card">
                <h2>{t("Đăng nhập Google")}</h2>
                {methods.error ? (
                  <ErrorState error={methods.error} retry={methods.reload} />
                ) : methods.data?.google ? (
                  <p className="settings-ok"><BadgeCheck aria-hidden="true" />{t("Đã liên kết Google")}</p>
                ) : methods.data?.googleAvailable ? (
                  <Button asChild variant="outline"><a href="/api/auth/google/start?intent=link">{t("Liên kết Google")}</a></Button>
                ) : (
                  <p className="muted">{t("Chưa bật đăng nhập Google")}</p>
                )}
              </section>
              {methods.data?.password && (
                <form className="settings-card" onSubmit={(e) => save(e, true)}>
                  <h2>{t("Đổi mật khẩu")}</h2>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="current">{t("Mật khẩu hiện tại")}</FieldLabel>
                      <Input id="current" name="current" type="password" autoComplete="current-password" required maxLength={128} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="new-password">{t("Mật khẩu mới")}</FieldLabel>
                      <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required aria-describedby="new-password-hint" />
                      <small id="new-password-hint" className="field-hint">{t("Tối thiểu 10 ký tự")}</small>
                    </Field>
                    <Submit busy={busy === "password"}>{t("Đổi mật khẩu")}</Submit>
                  </FieldGroup>
                </form>
              )}
            </>
          )}
          {section === "notifications" && <NotificationSettings parent={parent} />}
        </div>
      </div>
    </Page>
  );
}

import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// List tabs read as plurals in English only; the Vietnamese labels stay as they are.
const TAB_EN: Record<string, string> = { "Buổi học": "Sessions", "Gia sư": "Tutors", "Học sinh": "Students", "Tài khoản": "Accounts" };
import type { AdminData, Subject } from "@/lib/types";
import { Page, Heading, Loading, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Waiting } from "@/components/admin-kit";
import { AdminToday } from "@/components/admin-today";
import { AdminClasses } from "@/components/admin-classes";
import { AdminSessions } from "@/components/admin-sessions";
import { AdminTutors } from "@/components/admin-tutors";
import { AdminStudents } from "@/components/admin-students";
import { AdminAccounts } from "@/components/admin-accounts";
import { AdminCatalog } from "@/components/admin-catalog";
import { AdminFinance } from "@/components/admin-finance";
import { AdminAudit } from "@/components/admin-audit";
import AdminCommunity from "./AdminCommunity";
import AdminPosts from "./AdminPosts";

type Today = { students: number; tutors: number; credentials: number; withdrawals: number; community: number; disputes: unknown[]; sessions_waiting: number };
const TABS = ["today", "classes", "sessions", "tutors", "students", "users", "catalog", "posts", "community", "finance", "audit"];
// The catalog used to be two tabs; keep their old links working.
const OLD: Record<string, string> = { resources: "catalog", subjects: "catalog" };

export default function Admin() {
  const { t, lang } = useI18n(), { refresh } = useApp(), [params, setParams] = useSearchParams();
  const asked = params.get("tab") || "", tab = TABS.includes(OLD[asked] || asked) ? OLD[asked] || asked : "today";
  const result = useLoad<AdminData>("/admin"), subjects = useLoad<Subject[]>("/subjects"), today = useLoad<Today>("/admin/today").data;
  const waiting = today ? today.disputes.length + today.sessions_waiting + today.withdrawals + today.students + today.credentials + today.tutors + today.community : 0;
  const withData = (pane: (d: AdminData) => ReactNode) =>
    result.data ? pane(result.data) : result.error ? <ErrorState error={result.error} retry={result.reload} /> : <Loading />;
  const trigger = (value: string, label: string, n?: number) => <TabsTrigger value={value}>{lang === "en" ? (TAB_EN[label] ?? t(label)) : t(label)}<Waiting n={n} /></TabsTrigger>;
  return (
    <Page>
      <Heading
        title="Quản trị nền tảng"
        description={today ? (waiting ? t("{n} việc đang chờ", { n: waiting }) : t("Không có việc nào đang chờ")) : undefined}
        action={
          <Button asChild variant="outline">
            <Link to="/bookings">
              {t("Xem buổi học")}
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        }
      />
      <div className="admin-board">
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
          <TabsList variant="line" className="admin-tabs">
            {trigger("today", "Hôm nay", waiting)}
            {trigger("classes", "Lớp học")}
            {trigger("sessions", "Buổi học", today ? today.disputes.length + today.sessions_waiting : undefined)}
            {trigger("tutors", "Gia sư", today?.tutors)}
            {trigger("students", "Học sinh", today?.students)}
            {trigger("users", "Tài khoản")}
            {trigger("catalog", "Danh mục")}
            {trigger("posts", "Tin tức")}
            {trigger("community", "Cộng đồng", today?.community)}
            {trigger("finance", "Tài chính", today?.withdrawals)}
            {trigger("audit", "Nhật ký")}
          </TabsList>
          <TabsContent value="today"><AdminToday /></TabsContent>
          <TabsContent value="classes"><AdminClasses /></TabsContent>
          <TabsContent value="sessions"><AdminSessions /></TabsContent>
          <TabsContent value="tutors">{withData((d) => <AdminTutors data={d} subjects={subjects.data || []} onChanged={refresh} />)}</TabsContent>
          <TabsContent value="students"><AdminStudents /></TabsContent>
          <TabsContent value="users">{withData((d) => <AdminAccounts users={d.users} onChanged={refresh} />)}</TabsContent>
          <TabsContent value="catalog">{withData((d) => <AdminCatalog subjects={subjects.data || []} resources={d.resources} tutors={d.tutors} onChanged={refresh} />)}</TabsContent>
          <TabsContent value="posts"><AdminPosts /></TabsContent>
          <TabsContent value="community"><AdminCommunity /></TabsContent>
          <TabsContent value="finance"><AdminFinance /></TabsContent>
          <TabsContent value="audit"><AdminAudit /></TabsContent>
        </Tabs>
      </div>
    </Page>
  );
}

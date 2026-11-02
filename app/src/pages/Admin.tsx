import AdminCommunity, { CommunityLock } from "./AdminCommunity";
import { TutorReviewDialog } from "@/components/tutor-review-dialog";
import AdminPosts from "./AdminPosts";
import { accountRole } from "@/lib/types";
import { WorkspaceStats } from "@/components/workspace";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  ArrowUpRight,
  Users,
  Clock,
  ShieldCheck,
  Library,
} from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad, fold, dateTime, money } from "@/lib/api";
import type { AdminData, Resource, Subject, Tutor, User } from "@/lib/types";
import {
  Page,
  Heading,
  Person,
  State,
  Loading,
  ErrorState,
  Submit,
  Blank,
  Choose,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import ResourceEditor from "./ResourceEditor";
export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = ["tutors", "users", "resources", "subjects", "audit", "posts", "community"].includes(
      params.get("tab") || "",
    )
      ? params.get("tab")!
      : "tutors",
    status = params.get("status") || "";
  const communityQueue = useLoad<unknown[]>("/admin/community/queue");
  const { refresh } = useApp(),
    result = useLoad<AdminData>("/admin"),
    subjects = useLoad<Subject[]>("/subjects"),
    [q, setQ] = useState(""),
    [editor, setEditor] = useState<Resource | null | undefined>(undefined),
    [subject, setSubject] = useState<Subject | null | undefined>(undefined),
    [tutor, setTutor] = useState<Tutor | null>(null),
    [reviewOpen, setReviewOpen] = useState(false),
    [withdraw, setWithdraw] = useState<Tutor | null>(null),
    [account, setAccount] = useState<(User & { status: string }) | null>(null),
    [accountAction, setAccountAction] = useState<"status" | "admin" | "delete">("status"),
    [deleteEmail, setDeleteEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const withdrawTrigger = useRef<HTMLButtonElement | null>(null);
  async function mutate(path: string, method: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, data);
      setTutor(null);
      setWithdraw(null);
      setSubject(undefined);
      setAccount(null);
      refresh();
      toast.success("Đã lưu thay đổi");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (result.loading) return <Loading />;
  if (result.error || !result.data)
    return <ErrorState error={result.error} retry={result.reload} />;
  const d = result.data,
    pending = d.tutors.filter((t) => t.status === "pending");
  const matchingTutors = [...d.tutors]
    .filter(
      (t) =>
        (!status || t.status === status) &&
        fold(t.name + " " + t.headline).includes(fold(q)),
    )
    .sort(
      (a, b) => Number(b.status === "pending") - Number(a.status === "pending"),
    );
  const matchingUsers = d.users.filter((u) =>
    fold(u.name + " " + u.email).includes(fold(q)),
  );
  const matchingResources = d.resources.filter((r) =>
    fold(r.title).includes(fold(q)),
  );
  const matchingSubjects = (subjects.data || []).filter((s) =>
    fold(s.name).includes(fold(q)),
  );
  const matchingAudit = d.audit.filter((a) =>
    fold(a.name + " " + a.action).includes(fold(q)),
  );
  return (
    <Page>
      <Heading
        title="Quản trị nền tảng"
        action={
          <Button asChild variant="outline">
            <Link to="/bookings">
              Xem buổi học
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        }
      />
      <WorkspaceStats
        items={[
          { label: "Bài cộng đồng chờ duyệt", value: communityQueue.data?.length || 0, icon: Clock, to: "/admin?tab=community" },
          {
            label: "Hồ sơ chờ duyệt",
            value: pending.length,
            icon: Clock,
            to: "/admin?tab=tutors&status=pending",
          },
          {
            label: "Hồ sơ đã duyệt",
            value: d.tutors.filter((t) => t.status === "approved").length,
            icon: ShieldCheck,
            to: "/admin?tab=tutors&status=approved",
          },
          {
            label: "Tài khoản",
            value: d.users.length,
            icon: Users,
            to: "/admin?tab=users",
          },
          {
            label: "Mục kỳ thi",
            value: d.resources.length,
            icon: Library,
            to: "/admin?tab=resources",
          },
        ]}
      />
      <div className="admin-board">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setParams({ tab: v });
            setQ("");
          }}
        >
          <TabsList className="admin-tabs">
            <TabsTrigger value="tutors">Gia sư ({d.tutors.length})</TabsTrigger>
            <TabsTrigger value="users">Tài khoản</TabsTrigger>
            <TabsTrigger value="resources">Kỳ thi</TabsTrigger>
            <TabsTrigger value="subjects">Môn học</TabsTrigger>
            <TabsTrigger value="posts">Tin tức</TabsTrigger>
            <TabsTrigger value="community">Cộng đồng ({communityQueue.data?.length || 0})</TabsTrigger>
            <TabsTrigger value="audit">Nhật ký</TabsTrigger>
          </TabsList>
          {tab !== "posts" && tab !== "community" && <div className="admin-toolbar">
            <div className="admin-search">
              <Field>
                <FieldLabel htmlFor="admin-search" className="sr-only">
                  Tìm trong danh sách
                </FieldLabel>
                <div className="search-input">
                  <Search size={17} />
                  <Input
                    id="admin-search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm trong danh sách…"
                  />
                </div>
              </Field>
            </div>
            {tab === "tutors" && (
              <Choose
                label="Trạng thái hồ sơ"
                value={status}
                onChange={(v) => setParams(v ? { tab, status: v } : { tab })}
                allLabel="Tất cả hồ sơ"
                options={[
                  { value: "pending", label: "Chờ duyệt" },
                  { value: "approved", label: "Đã công bố" },
                  { value: "rejected", label: "Cần bổ sung" },
                  { value: "withdrawn", label: "Đã gỡ hồ sơ" },
                ]}
              />
            )}
          </div>}
          <TabsContent value="community"><AdminCommunity /></TabsContent>
          <TabsContent value="posts"><AdminPosts /></TabsContent>
          <TabsContent value="tutors">
            {!matchingTutors.length && (
              <Blank
                title="Không có kết quả phù hợp"
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQ("");
                      setParams({ tab });
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                }
              />
            )}
            <div className="admin-list">
              {matchingTutors.map((t) => (
                <article key={t.user_id}>
                  <Person
                    name={t.name}
                    id={t.user_id}
                    src={t.photo_url || undefined}
                  />
                  <div className="admin-row-main">
                    <h2>{t.name}</h2>
                    <p>{t.headline || "Chưa hoàn thiện hồ sơ"}</p>
                    <span>
                      {money(t.rate)} / giờ{t.demo ? " · Hồ sơ mẫu" : ""}
                    </span>
                  </div>
                  <State
                    value={
                      t.status === "pending" ? "pending_profile" : t.status
                    }
                  />
                  <Button
                    variant="outline"
                    onClick={e => {
                      reviewTrigger.current = e.currentTarget;
                      setTutor(t);
                      setReviewOpen(true);
                    }}
                  >
                    Xem & duyệt
                  </Button>
                  {t.status !== "withdrawn" && <Button variant="destructive" onClick={e => { withdrawTrigger.current = e.currentTarget; setError(""); setWithdraw(t); }}>Gỡ hồ sơ</Button>}
                </article>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="users">
            {!matchingUsers.length && (
              <Blank
                title="Không có kết quả phù hợp"
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQ("");
                      setParams({ tab });
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                }
              />
            )}
            <div className="admin-list">
              {matchingUsers.map((u) => (
                <article key={u.id}>
                  <Person name={u.name} id={u.id} />
                  <div className="admin-row-main">
                    <h2>{u.name}</h2>
                    <p>{u.email}</p>
                    <span>
                      {accountRole(u)}
                      {u.demo ? " · Tài khoản mẫu" : ""}
                    </span>
                  </div>
                  <State value={u.status} />
                  <CommunityLock owner={{...u,community_locked:Number(u.community_locked)}} />
                  {u.role !== "admin" && u.status === "active" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setError("");
                        setAccountAction("admin");
                        setAccount(u);
                      }}
                    >
                      <ShieldCheck data-icon="inline-start" />
                      Cấp quyền quản trị
                    </Button>
                  )}
                  {u.role !== "admin" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setError("");
                        setAccountAction("status");
                        setAccount(u);
                      }}
                    >
                      {u.status === "active" ? "Tạm khóa" : "Kích hoạt"}
                    </Button>
                  )}
                  {u.role !== "admin" && <Button variant="destructive" onClick={() => {
                    setError(""); setDeleteEmail(""); setAccountAction("delete"); setAccount(u);
                  }}>Xóa tài khoản</Button>}
                </article>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="resources">
            {!matchingResources.length && (
              <Blank
                title="Không có kết quả phù hợp"
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQ("");
                      setParams({ tab });
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                }
              />
            )}
            <div className="section-heading">
              <h2>{d.resources.length} kỳ thi</h2>
              <Button onClick={() => setEditor(null)}>
                <Plus data-icon="inline-start" />
                Thêm kỳ thi
              </Button>
            </div>
            <div className="admin-list">
              {matchingResources.map((r) => (
                <article key={r.id}>
                  <div className="admin-row-main">
                    <h2>{r.title}</h2>
                    <p>
                      {r.subject_name} · {r.source_name}
                    </p>
                  </div>
                  <span>{r.published ? "Đang công bố" : "Bản nháp"}</span>
                  <Button variant="outline" onClick={() => setEditor(r)}>
                    Chỉnh sửa
                  </Button>
                </article>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="subjects">
            {!matchingSubjects.length && (
              <Blank
                title="Không có kết quả phù hợp"
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQ("");
                      setParams({ tab });
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                }
              />
            )}
            <div className="section-heading">
              <h2>Danh mục môn học</h2>
              <Button
                onClick={() => {
                  setError("");
                  setSubject(null);
                }}
              >
                <Plus data-icon="inline-start" />
                Thêm môn
              </Button>
            </div>
            <div className="admin-list">
              {matchingSubjects.map((s) => (
                <article key={s.id}>
                  <div className="admin-row-main">
                    <h2>{s.name}</h2>
                    <p>{s.stage}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError("");
                      setSubject(s);
                    }}
                  >
                    Chỉnh sửa
                  </Button>
                </article>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="audit">
            {matchingAudit.length ? (
              <div className="admin-list">
                {matchingAudit.map((a) => (
                  <article key={a.id}>
                    <div className="admin-row-main">
                      <h2>{a.name}</h2>
                      <p>
                        {a.action} · #{a.target}
                      </p>
                    </div>
                    <span>{dateTime(a.created_at)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <Blank title="Chưa có thao tác quản trị" />
            )}
          </TabsContent>
        </Tabs>
      </div>
      <Dialog
        open={editor !== undefined}
        onOpenChange={(o) => {
          if (!o) setEditor(undefined);
        }}
      >
        <DialogContent className="editor-dialog">
          {editor !== undefined && (
            <ResourceEditor
              resource={editor}
              subjects={subjects.data || []}
              onSaved={() => {
                setEditor(undefined);
                refresh();
                toast.success("Đã lưu kỳ thi");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={subject !== undefined}
        onOpenChange={(o) => {
          if (!o) setSubject(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {subject ? "Chỉnh sửa môn học" : "Thêm môn học"}
            </DialogTitle>
            <DialogDescription>
              Danh mục dùng chung cho gia sư và thư viện.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.currentTarget));
              mutate(`/admin/subjects/${d.id}`, "PUT", d);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="subject-id">
                  Mã môn (chữ thường, số, dấu gạch ngang)
                </FieldLabel>
                <Input
                  id="subject-id"
                  name="id"
                  defaultValue={subject?.id}
                  readOnly={!!subject}
                  required
                  pattern="[a-z0-9-]+"
                  maxLength={50}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subject-name">Tên môn</FieldLabel>
                <Input
                  id="subject-name"
                  name="name"
                  defaultValue={subject?.name}
                  required
                  maxLength={100}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="stage">Cấp học</FieldLabel>
                <Input
                  id="stage"
                  name="stage"
                  defaultValue={subject?.stage}
                  required
                  maxLength={100}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subject-description">Nội dung</FieldLabel>
                <Textarea
                  id="subject-description"
                  name="description"
                  defaultValue={subject?.description}
                  required
                  maxLength={500}
                />
              </Field>
              {error && <ErrorState error={error} />}
              <Submit busy={busy}>Lưu môn học</Submit>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!withdraw} onOpenChange={open => { if (!open && !busy) setWithdraw(null); }}>
        <DialogContent closeDisabled={busy} onCloseAutoFocus={e => { e.preventDefault(); if (withdrawTrigger.current?.isConnected) withdrawTrigger.current.focus(); else document.getElementById("admin-search")?.focus(); }}>
          <DialogHeader><DialogTitle>Gỡ hồ sơ gia sư?</DialogTitle><DialogDescription>Hồ sơ của {withdraw?.name} sẽ ngừng hiển thị công khai. Tài khoản, tin nhắn và lịch đã đặt được giữ lại. Có thể duyệt lại để công bố.</DialogDescription></DialogHeader>
          {error && <ErrorState error={error} />}
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setWithdraw(null)}>Hủy</Button><Button variant="destructive" disabled={busy} onClick={() => withdraw && mutate(`/admin/tutors/${withdraw.user_id}`, "PATCH", { status: "withdrawn", revision: withdraw.review_revision })}>{busy ? "Đang gỡ…" : "Xác nhận gỡ hồ sơ"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <TutorReviewDialog tutor={tutor} catalog={d.theme_catalog} subjects={subjects.data || []} open={reviewOpen} onOpenChange={setReviewOpen} onSaved={refresh} returnFocus={() => {
        if (reviewTrigger.current?.isConnected) reviewTrigger.current.focus();
        else document.getElementById("admin-search")?.focus();
      }} />
      <Dialog
        open={!!account}
        onOpenChange={(o) => {
          if (!o && !busy) setAccount(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accountAction === "delete" ? "Xóa tài khoản?" : accountAction === "admin"
                ? "Cấp quyền quản trị?"
                : `${account?.status === "active" ? "Tạm khóa" : "Kích hoạt"} tài khoản?`}
            </DialogTitle>
            <DialogDescription>
              {account?.name} · {account?.email}.
              {accountAction === "delete" ? " Hồ sơ cá nhân, email và ảnh sẽ bị xóa; mọi phiên đăng nhập bị thu hồi. Lịch đang chờ hoặc đã nhận sẽ bị hủy. Lịch sử học và tin nhắn được giữ dưới tên Tài khoản đã xóa. Không thể khôi phục tài khoản này." : accountAction === "admin"
                ? " Tài khoản sẽ chuyển sang quản trị viên, có quyền quản lý tài khoản, hồ sơ và danh mục. Người này cần đăng nhập lại."
                : " Tạm khóa sẽ đăng xuất mọi phiên của tài khoản."}
            </DialogDescription>
          </DialogHeader>
          {error && <ErrorState error={error} />}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (account)
                mutate(
                  `/admin/users/${account.id}${accountAction === "admin" ? "/role" : ""}`,
                  accountAction === "delete" ? "DELETE" : "PATCH",
                  accountAction === "delete" ? { email: deleteEmail } : accountAction === "admin"
                    ? { role: "admin" }
                    : { status: account.status === "active" ? "suspended" : "active" },
                );
            }}
          >
            {accountAction === "delete" && <Field className="mb-4"><FieldLabel htmlFor="delete-account-email">Nhập lại email tài khoản để xác nhận</FieldLabel><Input id="delete-account-email" type="email" value={deleteEmail} onChange={e => setDeleteEmail(e.target.value)} autoComplete="off" required /></Field>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setAccount(null)}>
                Hủy
              </Button>
              <Submit busy={busy} disabled={accountAction === "delete" && deleteEmail.trim().toLowerCase() !== account?.email.toLowerCase()}>
                {accountAction === "delete" ? "Xác nhận xóa tài khoản" : accountAction === "admin" ? "Xác nhận cấp quyền" : "Xác nhận"}
              </Submit>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

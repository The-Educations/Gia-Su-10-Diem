import { TutorGallery } from "@/components/tutor-gallery";
import { WorkspaceStats } from "@/components/workspace";
import { useState } from "react";
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
  Section,
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
} from "@/components/ui/dialog";
import ResourceEditor from "./ResourceEditor";
export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = ["tutors", "users", "resources", "subjects", "audit"].includes(
      params.get("tab") || "",
    )
      ? params.get("tab")!
      : "tutors",
    status = params.get("status") || "";
  const { refresh } = useApp(),
    result = useLoad<AdminData>("/admin"),
    subjects = useLoad<Subject[]>("/subjects"),
    [q, setQ] = useState(""),
    [editor, setEditor] = useState<Resource | null | undefined>(undefined),
    [subject, setSubject] = useState<Subject | null | undefined>(undefined),
    [tutor, setTutor] = useState<Tutor | null>(null),
    [account, setAccount] = useState<(User & { status: string }) | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function mutate(path: string, method: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, data);
      setTutor(null);
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
            <TabsTrigger value="audit">Nhật ký</TabsTrigger>
          </TabsList>
          <div className="admin-toolbar">
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
                ]}
              />
            )}
          </div>
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
                      {t.cv ? " · Có CV" : " · Chưa có CV"}
                    </span>
                  </div>
                  <State
                    value={
                      t.status === "pending" ? "pending_profile" : t.status
                    }
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError("");
                      setTutor(t);
                    }}
                  >
                    Xem & duyệt
                  </Button>
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
                      {u.role === "student"
                        ? "Học sinh"
                        : u.role === "tutor"
                          ? "Gia sư"
                          : "Quản trị viên"}
                      {u.demo ? " · Tài khoản mẫu" : ""}
                    </span>
                  </div>
                  <State value={u.status} />
                  {u.role !== "admin" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setError("");
                        setAccount(u);
                      }}
                    >
                      {u.status === "active" ? "Tạm khóa" : "Kích hoạt"}
                    </Button>
                  )}
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
      <Dialog
        open={!!tutor}
        onOpenChange={(o) => {
          if (!o) setTutor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tutor?.name}</DialogTitle>
            <DialogDescription>
              {tutor?.headline || "Chưa hoàn thiện hồ sơ"}
            </DialogDescription>
          </DialogHeader>
          <div className="admin-profile-preview">
            {tutor && (
              <Person
                name={tutor.name}
                src={tutor.photo_url || undefined}
                large
              />
            )}
            <p>{tutor?.bio}</p>
          </div>
          {tutor?.teaching_style && (
            <Section title="Phương pháp giảng dạy">
              <p className="reading-text">{tutor.teaching_style}</p>
            </Section>
          )}
          {tutor?.lesson_plan && (
            <Section title="Một buổi học cùng tôi">
              <p className="reading-text">{tutor.lesson_plan}</p>
            </Section>
          )}
          {tutor && <TutorGallery images={tutor.gallery || []} name={tutor.name} />}
          {tutor?.cv && (
            <Button variant="outline" asChild>
              <a href={tutor.cv.url}>Tải CV · {tutor.cv.name}</a>
            </Button>
          )}
          <dl className="summary-list">
            <div>
              <dt>Học vấn</dt>
              <dd>{tutor?.education || "Chưa cung cấp"}</dd>
            </div>
            <div>
              <dt>Môn dạy</dt>
              <dd>
                {tutor?.subjects
                  .map((id) => subjects.data?.find((s) => s.id === id)?.name)
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt>Cấp học</dt>
              <dd>{tutor?.levels.join(", ") || "Chưa chọn"}</dd>
            </div>
            <div>
              <dt>Mục tiêu kỳ thi</dt>
              <dd>{tutor?.goals.join(", ") || "Chưa chọn"}</dd>
            </div>
            <div>
              <dt>Kinh nghiệm</dt>
              <dd>{tutor?.experience} năm</dd>
            </div>
            <div>
              <dt>Học phí</dt>
              <dd>{money(tutor?.rate || 0)} / giờ</dd>
            </div>
          </dl>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                d = new FormData(form),
                status = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                  "value",
                );
              if (tutor)
                mutate(`/admin/tutors/${tutor.user_id}`, "PATCH", {
                  status,
                  note: d.get("note"),
                });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="moderation-note">
                  Ghi chú cho gia sư
                </FieldLabel>
                <Textarea
                  id="moderation-note"
                  name="note"
                  defaultValue={tutor?.moderation_note}
                  maxLength={1000}
                />
              </Field>
              {error && <ErrorState error={error} />}
              <div className="actions">
                <Button type="submit" value="approved" disabled={busy}>
                  Duyệt & công bố
                </Button>
                <Button
                  type="submit"
                  variant="outline"
                  value="rejected"
                  disabled={busy}
                >
                  Yêu cầu bổ sung
                </Button>
              </div>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!account}
        onOpenChange={(o) => {
          if (!o) setAccount(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {account?.status === "active" ? "Tạm khóa" : "Kích hoạt"} tài
              khoản?
            </DialogTitle>
            <DialogDescription>
              {account?.name} · {account?.email}. Tạm khóa sẽ đăng xuất mọi
              phiên của tài khoản.
            </DialogDescription>
          </DialogHeader>
          {error && <ErrorState error={error} />}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (account)
                mutate(`/admin/users/${account.id}`, "PATCH", {
                  status: account.status === "active" ? "suspended" : "active",
                });
            }}
          >
            <Submit busy={busy}>Xác nhận</Submit>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

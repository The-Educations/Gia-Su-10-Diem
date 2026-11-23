import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, fold } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Resource, Subject, Tutor } from "@/lib/types";
import ResourceEditor from "@/pages/ResourceEditor";
import { Blank, ErrorState, Submit } from "./common";
import { AdminSearch, AdminToolbar, RowMenu } from "./admin-kit";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

type Removal = { kind: "subjects" | "resources"; id: string | number; name: string };

// Subjects and their exams in one place. Tutors pick both into their profile, so every
// row says how many profiles use it and removal spells out which profiles change.
export function AdminCatalog({ subjects, resources, tutors, onChanged }: { subjects: Subject[]; resources: Resource[]; tutors: Tutor[]; onChanged: () => void }) {
  const { t } = useI18n(),
    [q, setQ] = useState(""),
    [subject, setSubject] = useState<Subject | null | undefined>(undefined),
    [exam, setExam] = useState<{ resource: Resource | null; subjectId?: string } | null>(null),
    [removal, setRemoval] = useState<Removal | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const categories = [...new Set(resources.map((r) => r.category))].sort();
  const teaching = (id: string) => tutors.filter((x) => x.subjects.includes(id)).length;
  const aiming = (category: string) => tutors.filter((x) => x.goals.includes(category)).length;
  const query = fold(q);
  const groups = subjects
    .map((s) => {
      const all = resources.filter((r) => r.subject_id === s.id);
      return { s, all, exams: fold(s.name).includes(query) ? all : all.filter((r) => fold(`${r.title} ${r.category}`).includes(query)) };
    })
    .filter((g) => !query || fold(g.s.name).includes(query) || g.exams.length);

  // What a removal takes out of tutor profiles: the subject itself, and any exam group
  // that would be left without a published exam.
  function impact(r: Removal) {
    const gone = r.kind === "subjects" ? resources.filter((x) => x.subject_id === r.id) : resources.filter((x) => x.id === r.id);
    const goals = [...new Set(gone.map((x) => x.category))].filter((c) => !resources.some((x) => x.published && x.category === c && !gone.includes(x)));
    const hit = tutors.filter((x) => (r.kind === "subjects" && x.subjects.includes(String(r.id))) || x.goals.some((g) => goals.includes(g)));
    return { exams: r.kind === "subjects" ? gone.length : 0, goals, hit };
  }
  async function send(path: string, method: string, body: unknown, done: string, inDialog = true) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, body);
      setSubject(undefined);
      setRemoval(null);
      onChanged();
      toast.success(t(done));
    } catch (e) {
      if (inDialog) setError((e as Error).message);
      else toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const toggle = (r: Resource) => {
    const { title, subject_id, category, level, year, description, source_name, source_url } = r;
    return send(`/admin/resources/${r.id}`, "PUT", { title, subject_id, category, level, year, description, source_name, source_url, published: !r.published }, r.published ? "Đã ẩn kỳ thi" : "Đã hiện kỳ thi", false);
  };
  const hit = removal && impact(removal);
  return (
    <div className="admin-pane">
      <AdminToolbar>
        <AdminSearch value={q} onChange={setQ} placeholder="Tìm môn hoặc kỳ thi…" />
        <span className="admin-bar-gap" />
        <Button variant="outline" onClick={() => setExam({ resource: null })}><Plus data-icon="inline-start" />{t("Thêm kỳ thi")}</Button>
        <Button onClick={() => { setError(""); setSubject(null); }}><Plus data-icon="inline-start" />{t("Thêm môn")}</Button>
      </AdminToolbar>
      {!groups.length && <Blank title={t("Không có kết quả phù hợp")} action={<Button variant="outline" onClick={() => setQ("")}>{t("Xóa bộ lọc")}</Button>} />}
      <div className="catalog">
        {groups.map(({ s, all, exams }) => (
          <section key={s.id} className="catalog-subject" aria-label={s.name}>
            <header>
              <div>
                <h3>{s.name}</h3>
                <p>{s.stage} · {t("{n} gia sư dạy", { n: teaching(s.id) })} · {t("{n} kỳ thi", { n: all.length })}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setExam({ resource: null, subjectId: s.id })}><Plus data-icon="inline-start" />{t("Kỳ thi")}</Button>
              <Button size="sm" variant="outline" onClick={() => { setError(""); setSubject(s); }}>{t("Sửa môn")}</Button>
              <RowMenu label="Thao tác khác" items={[{ label: "Bỏ môn", danger: true, onSelect: () => { setError(""); setRemoval({ kind: "subjects", id: s.id, name: s.name }); } }]} />
            </header>
            {exams.length ? (
              <ul>
                {exams.map((r) => (
                  <li key={r.id} data-hidden={!r.published || undefined}>
                    <div>
                      <strong>{r.title}</strong>
                      <small>{r.category} · {r.level} · {r.year} · {t("{n} gia sư chọn nhóm này", { n: aiming(r.category) })}</small>
                    </div>
                    <span className="catalog-state">{t(r.published ? "Đang hiển thị" : "Đang ẩn")}</span>
                    <Button size="sm" variant="ghost" onClick={() => setExam({ resource: r })}>{t("Sửa")}</Button>
                    <RowMenu label="Thao tác khác" items={[
                      { label: r.published ? "Ẩn khỏi danh mục" : "Hiện trong danh mục", onSelect: () => toggle(r) },
                      { label: "Bỏ kỳ thi", danger: true, onSelect: () => { setError(""); setRemoval({ kind: "resources", id: r.id, name: r.title }); } },
                    ]} />
                  </li>
                ))}
              </ul>
            ) : <p className="catalog-empty">{t("Chưa có kỳ thi cho môn này.")}</p>}
          </section>
        ))}
      </div>
      <Dialog open={!!removal} onOpenChange={(o) => { if (!o && !busy) setRemoval(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Bỏ {name}?", { name: removal?.name || "" })}</DialogTitle>
            <DialogDescription>{t("Mục này sẽ không còn trong danh mục để chọn mới. Lịch học và đề nghị đã có vẫn được giữ lại.")}</DialogDescription>
          </DialogHeader>
          {hit && (
            <ul className="catalog-impact">
              {hit.exams > 0 && <li>{t("{n} kỳ thi thuộc môn cũng được bỏ.", { n: hit.exams })}</li>}
              {hit.goals.length > 0 && <li>{t("Mục tiêu không còn kỳ thi: {goals}", { goals: hit.goals.join(", ") })}</li>}
              <li>{hit.hit.length ? t("Hồ sơ của {n} gia sư sẽ được cập nhật: {names}", { n: hit.hit.length, names: hit.hit.slice(0, 5).map((x) => x.name).join(", ") + (hit.hit.length > 5 ? "…" : "") }) : t("Chưa có hồ sơ gia sư nào dùng mục này.")}</li>
            </ul>
          )}
          {error && <ErrorState error={error} />}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setRemoval(null)}>{t("Giữ lại")}</Button>
            <Button variant="destructive" disabled={busy} onClick={() => removal && send(`/admin/${removal.kind}/${removal.id}`, "DELETE", {}, "Đã bỏ khỏi danh mục")}>{t(busy ? "Đang bỏ…" : "Bỏ khỏi danh mục")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!exam} onOpenChange={(o) => { if (!o) setExam(null); }}>
        <DialogContent className="editor-dialog">
          {exam && <ResourceEditor resource={exam.resource} subjectId={exam.subjectId} subjects={subjects} categories={categories} onSaved={() => { setExam(null); onChanged(); toast.success(t("Đã lưu kỳ thi")); }} />}
        </DialogContent>
      </Dialog>
      <Dialog open={subject !== undefined} onOpenChange={(o) => { if (!o) setSubject(undefined); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(subject ? "Chỉnh sửa môn học" : "Thêm môn học")}</DialogTitle>
            <DialogDescription>{subject ? t("Đổi tên áp dụng ngay cho {n} hồ sơ gia sư đang dạy môn này.", { n: teaching(subject.id) }) : t("Môn mới xuất hiện trong hồ sơ gia sư và bộ lọc tìm gia sư.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); send(`/admin/subjects/${d.id}`, "PUT", d, "Đã lưu môn học"); }}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="subject-id">{t("Mã môn (chữ thường, số, dấu gạch ngang)")}</FieldLabel>
                <Input id="subject-id" name="id" defaultValue={subject?.id} readOnly={!!subject} required pattern="[a-z0-9-]+" maxLength={50} />
              </Field>
              <Field>
                <FieldLabel htmlFor="subject-name">{t("Tên môn")}</FieldLabel>
                <Input id="subject-name" name="name" defaultValue={subject?.name} required maxLength={100} />
              </Field>
              <Field>
                <FieldLabel htmlFor="stage">{t("Cấp học")}</FieldLabel>
                <Input id="stage" name="stage" defaultValue={subject?.stage} required maxLength={100} />
              </Field>
              <Field>
                <FieldLabel htmlFor="subject-description">{t("Nội dung")}</FieldLabel>
                <Textarea id="subject-description" name="description" defaultValue={subject?.description} required maxLength={500} />
              </Field>
              {error && <ErrorState error={error} />}
              <Submit busy={busy}>{t("Lưu môn học")}</Submit>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { api } from "@/lib/api";
import type { Resource, Subject } from "@/lib/types";
import { Choose, Submit, ErrorState } from "@/components/common";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export default function ResourceEditor({
  resource,
  subjects,
  onSaved,
}: {
  resource: Resource | null;
  subjects: Subject[];
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(
      resource?.subject_id || subjects[0]?.id || "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      await api(
        resource ? `/admin/resources/${resource.id}` : "/admin/resources",
        resource ? "PUT" : "POST",
        {
          ...d,
          subject_id: subject,
          year: Number(d.year),
          published: d.published === "on",
        },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {resource ? "Chỉnh sửa kỳ thi" : "Thêm mục tiêu kỳ thi"}
        </DialogTitle>
        <DialogDescription>
          Liên kết thông tin và môn học để tìm gia sư.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={save}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="resource-title">Tên mục</FieldLabel>
            <Input
              id="resource-title"
              name="title"
              defaultValue={resource?.title}
              required
              maxLength={200}
            />
          </Field>
          <Choose
            label="Môn tìm gia sư"
            value={subject}
            onChange={setSubject}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
          />
          <div className="form-two">
            <Field>
              <FieldLabel htmlFor="category">Nhóm kỳ thi</FieldLabel>
              <Input
                id="category"
                name="category"
                defaultValue={resource?.category}
                required
                maxLength={80}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="level">Lớp / Cấp học</FieldLabel>
              <Input
                id="level"
                name="level"
                defaultValue={resource?.level || "Lớp 12"}
                required
                maxLength={80}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="year">Năm tham khảo</FieldLabel>
              <Input
                id="year"
                name="year"
                type="number"
                min={2000}
                max={2100}
                defaultValue={resource?.year || new Date().getFullYear()}
                required
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="description">Mô tả</FieldLabel>
            <Textarea
              id="description"
              name="description"
              defaultValue={resource?.description}
              required
              maxLength={2000}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="source_name">
              Đơn vị tổ chức / Nguồn
            </FieldLabel>
            <Input
              id="source_name"
              name="source_name"
              defaultValue={resource?.source_name}
              required
              maxLength={200}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="source_url">Đường dẫn nguồn HTTPS</FieldLabel>
            <Input
              id="source_url"
              name="source_url"
              type="url"
              defaultValue={resource?.source_url}
              required
            />
          </Field>
          <label className="checkbox-label">
            <input
              name="published"
              type="checkbox"
              defaultChecked={resource ? !!resource.published : true}
            />
            Hiển thị trong danh mục
          </label>
          {error && <ErrorState error={error} />}
          <Submit busy={busy}>Lưu kỳ thi</Submit>
        </FieldGroup>
      </form>
    </>
  );
}

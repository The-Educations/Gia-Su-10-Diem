import { useId, useRef, useState } from "react";
import {
  Award,
  BadgeCheck,
  Check,
  ChevronsUpDown,
  CircleAlert,
  Clock,
  FileText,
  GraduationCap,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import "@/credentials.css";
import catalog from "../../../shared/credential-catalog.json";
import { api, fold, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Credential, CredentialDetail, CredentialKind, TutorKind } from "@/lib/types";
import { ErrorState, Loading, Submit } from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

type Entry = { id: string; name: string; short?: string; type?: string; city?: string; prizes?: string[]; group?: string; score?: Score | null };
type Score = { label: string; min?: number; max?: number; step?: number; options?: string[]; text?: boolean };

const OTHER = "__other";
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 5 * 1024 * 1024;
const thisYear = new Date().getFullYear();

const KINDS: Record<CredentialKind, { title: string; add: string; icon: LucideIcon; entries: Entry[]; proof: string }> = {
  school: { title: "Trường học", add: "Thêm trường", icon: GraduationCap, entries: catalog.schools, proof: "Thẻ sinh viên, bằng tốt nghiệp hoặc bảng điểm" },
  award: { title: "Giải thưởng", add: "Thêm giải thưởng", icon: Award, entries: catalog.awards, proof: "Giấy chứng nhận hoặc quyết định khen thưởng" },
  certificate: { title: "Chứng chỉ", add: "Thêm chứng chỉ", icon: ScrollText, entries: catalog.certificates as Entry[], proof: "Ảnh hoặc PDF chứng chỉ, thấy rõ số báo danh" },
};
const SCHOOL_PROOF: Record<string, string> = {
  student: "Thẻ sinh viên còn hạn",
  teacher: "Bằng tốt nghiệp hoặc quyết định công tác",
  professional: "Bằng tốt nghiệp",
};
const emptyDetail: CredentialDetail = { field: "", start_year: null, end_year: null, current: false, prize: "", subject: "", score: "", reference: "" };

function CatalogPicker({ kind, value, onChange }: { kind: CredentialKind; value: string; onChange: (id: string) => void }) {
  const { t } = useI18n(),
    id = useId(),
    [open, setOpen] = useState(false),
    entries = KINDS[kind].entries,
    selected = entries.find((e) => e.id === value);
  const groups = kind === "school"
    ? [["Đại học", entries.filter((e) => e.type === "university")], ["THPT chuyên", entries.filter((e) => e.type === "high_school")]] as const
    : [["", entries]] as const;
  const label = t(kind === "school" ? "Trường" : kind === "award" ? "Cuộc thi / giải thưởng" : "Chứng chỉ");
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="address-trigger">
            <span className="truncate">{value === OTHER ? t("Khác (tự nhập)") : selected?.name || t("Chọn trong danh sách")}</span>
            <ChevronsUpDown data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="address-popover catalog-popover" align="start" aria-label={label}>
          <Command filter={(v, search) => (fold(v).includes(fold(search).trim()) ? 1 : 0)}>
            <CommandInput aria-label={t("Tìm")} placeholder={t("Nhập tên hoặc tên viết tắt…")} />
            <CommandList>
              <CommandEmpty>{t("Không có trong danh sách. Chọn Khác để tự nhập.")}</CommandEmpty>
              {groups.map(([heading, items]) => (
                <CommandGroup key={heading} heading={heading ? t(heading) : undefined}>
                  {items.map((e) => (
                    <CommandItem key={e.id} value={`${e.name} ${e.short || ""} ${e.city || ""}`} onSelect={() => { onChange(e.id); setOpen(false); }}>
                      <span className="catalog-option">
                        {e.name}
                        {(e.short || e.city) && <small>{[e.short, e.city].filter(Boolean).join(" · ")}</small>}
                      </span>
                      {value === e.id && <Check className="ml-auto" aria-hidden="true" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              <CommandGroup>
                <CommandItem value="khac other" onSelect={() => { onChange(OTHER); setOpen(false); }}>
                  {t("Khác (tự nhập)")}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function FilePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const { t } = useI18n(),
    input = useRef<HTMLInputElement>(null);
  return (
    <div className="proof-picker">
      <button type="button" className="proof-drop" onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onChange([...files, ...Array.from(e.dataTransfer.files)].slice(0, 3)); }}>
        <Upload aria-hidden="true" />
        <span>{t("Chọn hoặc kéo tệp minh chứng vào đây")}</span>
        <small>{t("JPG, PNG, WebP hoặc PDF · tối đa 5 MB · 3 tệp")}</small>
      </button>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onChange([...files, ...Array.from(e.target.files || [])].slice(0, 3)); e.target.value = ""; }} />
      {files.length > 0 && (
        <ul className="proof-files">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <FileText aria-hidden="true" />
              <span>{f.name}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={t("Bỏ {name}", { name: f.name })} onClick={() => onChange(files.filter((_, j) => j !== i))}><X /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function uploadProof(id: number, file: File) {
  if (file.size > MAX_BYTES) throw new Error(`${file.name}: tệp tối đa 5 MB.`);
  const res = await fetch(`/api/tutor/credentials/${id}/files`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Không tải được tệp.");
  return data as Credential;
}

function CredentialDialog({ kind, editing, tutorKind, open, onOpenChange, onSaved }: {
  kind: CredentialKind; editing: Credential | null; tutorKind: TutorKind; open: boolean;
  onOpenChange: (open: boolean) => void; onSaved: () => void;
}) {
  const { t } = useI18n(),
    [catalogId, setCatalogId] = useState(editing ? editing.catalog_id || OTHER : ""),
    [name, setName] = useState(editing && !editing.catalog_id ? editing.name : ""),
    [detail, setDetail] = useState<CredentialDetail>(editing?.detail || emptyDetail),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const entry = KINDS[kind].entries.find((e) => e.id === catalogId);
  const set = (patch: Partial<CredentialDetail>) => setDetail((d) => ({ ...d, ...patch }));
  const proof = kind === "school" && SCHOOL_PROOF[tutorKind] ? SCHOOL_PROOF[tutorKind] : KINDS[kind].proof;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!catalogId) return setError(t("Chọn một mục trong danh sách hoặc chọn Khác."));
    if (!editing && !files.length) return setError(t("Thêm ít nhất một tệp minh chứng."));
    setBusy(true);
    setError("");
    try {
      const body = { kind, catalog_id: catalogId === OTHER ? "" : catalogId, name: catalogId === OTHER ? name : "", detail };
      const saved = await api<Credential>(editing ? `/tutor/credentials/${editing.id}` : "/tutor/credentials", editing ? "PUT" : "POST", body);
      for (const file of files) await uploadProof(saved.id, file);
      toast.success(t("Đã gửi để quản trị viên đối chiếu"));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  const score = entry?.score;
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="credential-dialog" closeDisabled={busy}>
        <DialogHeader>
          <DialogTitle>{t(editing ? "Sửa thông tin" : KINDS[kind].add)}</DialogTitle>
          <DialogDescription>{t("Minh chứng: {proof}", { proof: t(proof) })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <CatalogPicker kind={kind} value={catalogId} onChange={(id) => { setCatalogId(id); if (kind === "award") set({ prize: "" }); if (kind === "certificate") set({ score: "" }); }} />
            {catalogId === OTHER && (
              <Field>
                <FieldLabel htmlFor="credential-name">{t("Tên")}</FieldLabel>
                <Input id="credential-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={200} />
              </Field>
            )}
            {kind === "school" && (
              <>
                <Field>
                  <FieldLabel htmlFor="credential-field">{t("Chuyên ngành / lớp chuyên")}</FieldLabel>
                  <Input id="credential-field" value={detail.field} onChange={(e) => set({ field: e.target.value })} maxLength={120} />
                </Field>
                <div className="form-two">
                  <Field>
                    <FieldLabel htmlFor="credential-start">{t("Năm bắt đầu")}</FieldLabel>
                    <Input id="credential-start" type="number" min={1950} max={thisYear} required value={detail.start_year ?? ""} onChange={(e) => set({ start_year: e.target.value ? Number(e.target.value) : null })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="credential-end">{t("Năm kết thúc")}</FieldLabel>
                    <Input id="credential-end" type="number" min={1950} max={thisYear + 6} disabled={detail.current} value={detail.current ? "" : detail.end_year ?? ""} onChange={(e) => set({ end_year: e.target.value ? Number(e.target.value) : null })} />
                  </Field>
                </div>
                <Field orientation="horizontal">
                  <input id="credential-current" type="checkbox" checked={detail.current} onChange={(e) => set({ current: e.target.checked, end_year: e.target.checked ? null : detail.end_year })} />
                  <FieldLabel htmlFor="credential-current">{t("Đang học")}</FieldLabel>
                </Field>
              </>
            )}
            {kind === "award" && (
              <>
                <div className="form-two">
                  <Field>
                    <FieldLabel htmlFor="credential-prize">{t("Giải")}</FieldLabel>
                    {entry?.prizes ? (
                      <select id="credential-prize" className="native-select" required value={detail.prize} onChange={(e) => set({ prize: e.target.value })}>
                        <option value="">{t("Chọn giải")}</option>
                        {entry.prizes.map((p) => <option key={p} value={p}>{t(p)}</option>)}
                      </select>
                    ) : (
                      <Input id="credential-prize" required maxLength={80} value={detail.prize} onChange={(e) => set({ prize: e.target.value })} />
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="credential-year">{t("Năm")}</FieldLabel>
                    <Input id="credential-year" type="number" min={1950} max={thisYear} value={detail.end_year ?? ""} onChange={(e) => set({ end_year: e.target.value ? Number(e.target.value) : null })} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="credential-subject">{t("Môn thi")}</FieldLabel>
                  <Input id="credential-subject" maxLength={80} value={detail.subject} onChange={(e) => set({ subject: e.target.value })} />
                </Field>
              </>
            )}
            {kind === "certificate" && (
              <>
                <div className="form-two">
                  {(score || catalogId === OTHER) && (
                    <Field>
                      <FieldLabel htmlFor="credential-score">{t(score?.label || "Điểm / cấp độ")}</FieldLabel>
                      {score?.options ? (
                        <select id="credential-score" className="native-select" required value={detail.score} onChange={(e) => set({ score: e.target.value })}>
                          <option value="">{t("Chọn")}</option>
                          {score.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <Input id="credential-score" required type={score && !score.text ? "number" : "text"} min={score?.min} max={score?.max} step={score?.step} maxLength={40} value={detail.score} onChange={(e) => set({ score: e.target.value })} />
                      )}
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="credential-year">{t("Năm cấp")}</FieldLabel>
                    <Input id="credential-year" type="number" min={1950} max={thisYear} value={detail.end_year ?? ""} onChange={(e) => set({ end_year: e.target.value ? Number(e.target.value) : null })} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="credential-ref">{t("Số báo danh / mã chứng chỉ")}</FieldLabel>
                  <Input id="credential-ref" maxLength={60} value={detail.reference} onChange={(e) => set({ reference: e.target.value })} />
                </Field>
              </>
            )}
            {!editing && <FilePicker files={files} onChange={setFiles} />}
          </FieldGroup>
          {error && <ErrorState error={error} />}
          <div className="actions dialog-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("Hủy")}</Button>
            <Submit busy={busy}>{t(editing ? "Lưu & gửi đối chiếu" : "Thêm & gửi đối chiếu")}</Submit>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATUS: Record<Credential["status"], [string, LucideIcon]> = {
  pending: ["Chờ đối chiếu", Clock],
  approved: ["Đã xác minh", BadgeCheck],
  rejected: ["Cần bổ sung", CircleAlert],
};

function CredentialCard({ c, onEdit, onChanged }: { c: Credential; onEdit: () => void; onChanged: () => void }) {
  const { t } = useI18n(),
    input = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false);
  const missing = !c.files.length;
  const [label, Icon] = missing ? ["Thiếu minh chứng", CircleAlert] as const : STATUS[c.status];
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    try { await task(); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <li className="credential-card" data-status={missing ? "missing" : c.status} aria-busy={busy}>
      <div className="credential-head">
        <div>
          <strong>{c.name}</strong>
          {c.label !== c.name && <span>{c.label.replace(`${c.name} · `, "")}</span>}
        </div>
        <span className="credential-status"><Icon aria-hidden="true" />{t(label)}</span>
      </div>
      {c.status === "rejected" && c.review_note && <p className="credential-note">{c.review_note}</p>}
      <ul className="proof-thumbs">
        {c.files.map((f) => (
          <li key={f.id}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" aria-label={t("Mở {name}", { name: f.name })}>
              {f.mime.startsWith("image/") ? <img src={f.url} alt="" /> : <FileText aria-hidden="true" />}
            </a>
            <button type="button" aria-label={t("Xóa {name}", { name: f.name })} disabled={busy} onClick={() => run(() => api(`/tutor/credentials/${c.id}/files/${f.id}`, "DELETE"))}><X /></button>
          </li>
        ))}
        {c.files.length < 3 && (
          <li>
            <button type="button" className="proof-add" disabled={busy} onClick={() => input.current?.click()} aria-label={t("Thêm tệp minh chứng")}>
              <Plus aria-hidden="true" />
            </button>
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) run(() => uploadProof(c.id, file)); }} />
          </li>
        )}
      </ul>
      <div className="credential-actions">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onEdit}><Pencil data-icon="inline-start" />{t("Sửa")}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { if (confirm(t("Xóa mục này và các tệp minh chứng?"))) run(() => api(`/tutor/credentials/${c.id}`, "DELETE")); }}><Trash2 data-icon="inline-start" />{t("Xóa")}</Button>
      </div>
    </li>
  );
}

export function useCredentials() {
  return useLoad<Credential[]>("/tutor/credentials");
}

export function CredentialsEditor({ tutorKind, result }: { tutorKind: TutorKind; result: ReturnType<typeof useCredentials> }) {
  const { t } = useI18n(),
    [dialog, setDialog] = useState<{ kind: CredentialKind; editing: Credential | null; key: number } | null>(null);
  if (result.loading) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={result.reload} />;
  const rows = result.data || [];
  return (
    <div className="credentials-editor">
      {(Object.keys(KINDS) as CredentialKind[]).map((kind) => {
        const { title, add, icon: Icon } = KINDS[kind], items = rows.filter((c) => c.kind === kind);
        return (
          <section key={kind} className="credential-group">
            <header>
              <h3><Icon aria-hidden="true" />{t(title)}{kind === "school" && <span className="required-mark">{t("bắt buộc")}</span>}</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind, editing: null, key: Date.now() })}>
                <Plus data-icon="inline-start" />{t(add)}
              </Button>
            </header>
            {items.length ? (
              <ul className="credential-list">
                {items.map((c) => <CredentialCard key={c.id} c={c} onEdit={() => setDialog({ kind, editing: c, key: Date.now() })} onChanged={result.reload} />)}
              </ul>
            ) : (
              <p className="credential-empty">{t(kind === "school" ? "Thêm trường bạn đang học hoặc đã tốt nghiệp kèm minh chứng." : "Không bắt buộc. Thêm để hồ sơ nổi bật hơn.")}</p>
            )}
          </section>
        );
      })}
      {dialog && (
        <CredentialDialog key={dialog.key} kind={dialog.kind} editing={dialog.editing} tutorKind={tutorKind} open onOpenChange={(open) => !open && setDialog(null)} onSaved={result.reload} />
      )}
    </div>
  );
}

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, Pencil, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { api, useLoad } from "@/lib/api";
import type { AdminNewsPost, NewsArticleData, NewsTopic, Resource } from "@/lib/types";
import { Choose, ErrorState, Loading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { NewsArticle } from "@/components/news/news-article";
import { NEWS_TOPICS } from "@/lib/news-topics";
import { NEWS_LEVELS, buildCta, countWords, formatClock, htmlToText, plainBodyToHtml, readingMinutes } from "@/lib/news";
import { CoverField, NEWS_IMAGE_BASE, NEWS_IMAGE_UPLOAD } from "./cover-field";
import { ConfirmDialog } from "./confirm-dialog";
import { checkNews, emptyForm, type NewsFormState } from "./checks";
import { useI18n } from "@/lib/i18n";

const RichEditor = lazy(() => import("@/components/community/RichEditor"));
const draftKey = (id: number | "new") => `news-draft:${id}`;

function formFromPost(post: AdminNewsPost | null): NewsFormState {
  if (!post) return emptyForm;
  return {
    title: post.title, summary: post.summary, topic: post.topic, cover_url: post.cover_url, cover_alt: post.cover_alt,
    cover_credit: post.cover_credit, source_name: post.source_name, source_url: post.source_url,
    cta_level: post.cta_level, cta_goal: post.cta_goal, pin: !!post.pinned,
    // Plain-text (legacy or n8n) articles open as paragraphs; the first save turns them into HTML articles.
    body_html: post.body_html || plainBodyToHtml(post.body),
  };
}

export default function NewsEditor({ id, close }: { id: number | "new"; close: (saved?: "published" | "drafts" | "review") => void }) {
  const { t } = useI18n();
  const loaded = useLoad<AdminNewsPost>(id === "new" ? null : `/admin/posts/${id}`);
  if (loaded.loading) return <Loading />;
  if (loaded.error) return <><ErrorState error={loaded.error} retry={loaded.reload} /><Button variant="outline" onClick={() => close()}>{t("← Quay lại danh sách")}</Button></>;
  return <EditorForm id={id} first={loaded.data} close={close} />;
}

function EditorForm({ id, first, close }: { id: number | "new"; first: AdminNewsPost | null; close: (saved?: "published" | "drafts" | "review") => void }) {
  const { t } = useI18n();
  const [post, setPost] = useState(first);
  const initial = useMemo(() => formFromPost(post), [post]);
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [editorKey, setEditorKey] = useState(0), [text, setText] = useState(() => htmlToText(initial.body_html));
  const [busy, setBusy] = useState(false), [uploads, setUploads] = useState(0);
  const [error, setError] = useState(""), [problems, setProblems] = useState<string[]>([]);
  const [preview, setPreview] = useState(false), [confirm, setConfirm] = useState<"delete" | "unpublish" | "leave" | null>(null);
  const [restore, setRestore] = useState<{ at: number; form: NewsFormState } | null>(null);
  const goals = useLoad<Resource[]>("/resources");
  const dirty = JSON.stringify(form) !== saved;
  const published = !!post?.published;
  const words = countWords(text);
  const check = checkNews(form, words, post?.origin ?? "manual");
  const set = (patch: Partial<NewsFormState>) => setForm((f) => ({ ...f, ...patch }));
  const key = draftKey(post?.id ?? id);

  // A draft kept in this browser that is newer than the server copy is offered back, never applied silently.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(id));
      if (!raw) return;
      const draft = JSON.parse(raw) as { at: number; form: NewsFormState };
      const serverTime = first ? Date.parse(`${first.updated_at.replace(" ", "T")}Z`) : 0;
      if (draft.at > serverTime && JSON.stringify(draft.form) !== JSON.stringify(initial)) setRestore(draft);
    } catch { /* storage unavailable or corrupt: start clean */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Every 3 seconds of edits, keep a local copy so a crash or closed tab does not lose the article.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), form })); } catch { /* ignore */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [form, dirty, key]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(async (publish: boolean) => {
    if (busy || uploads) return;
    if (publish && !check.canPublish) { setProblems(check.required.filter((r) => !r.ok).map((r) => r.bad)); setError("Bài chưa đủ điều kiện đăng."); return; }
    setBusy(true); setError(""); setProblems([]);
    try {
      const { pin, ...fields } = form;
      const body = { ...fields, published: publish };
      let row = await api<AdminNewsPost>(post ? `/admin/posts/${post.id}` : "/admin/posts", post ? "PUT" : "POST", body);
      if (row.published && pin !== !!row.pinned) row = await api<AdminNewsPost>(`/admin/posts/${row.id}/pin`, "POST", { pinned: pin });
      try { localStorage.removeItem(draftKey(id)); localStorage.removeItem(draftKey(row.id)); } catch { /* ignore */ }
      toast.success(publish ? (published ? "Đã cập nhật bài" : "Đã đăng bài") : "Đã lưu nháp");
      if (publish) return close("published");
      const next = formFromPost(row);
      setPost(row); setForm({ ...next, body_html: form.body_html }); setSaved(JSON.stringify({ ...next, body_html: form.body_html }));
    } catch (e) {
      const err = e as Error & { problems?: string[] };
      setError(err.message); setProblems(err.problems ?? []);
    } finally { setBusy(false); }
  }, [busy, uploads, check, form, post, id, published, close]);

  // Ctrl/Cmd+S saves a draft (or updates the article when it is already live).
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveRef.current(published); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [published]);

  async function act(path: string, method: string, done: string, then: "published" | "drafts" | "review" | undefined) {
    if (!post) return;
    setBusy(true); setError("");
    try {
      await api(path, method, method === "DELETE" ? undefined : {});
      try { localStorage.removeItem(draftKey(post.id)); } catch { /* ignore */ }
      toast.success(done); close(then);
    } catch (e) { setError((e as Error).message); setConfirm(null); }
    finally { setBusy(false); }
  }
  const back = () => (dirty ? setConfirm("leave") : close());

  const topic = form.topic as NewsTopic;
  const previewData: NewsArticleData = {
    id: post?.id ?? 0, slug: post?.slug ?? "", title: form.title || "(Chưa có tiêu đề)", summary: form.summary, topic,
    cover_url: form.cover_url.trim(), cover_alt: form.cover_alt, cover_credit: form.cover_credit,
    published_at: post?.published_at ?? new Date().toISOString(), revised_at: post?.revised_at ?? null,
    reading_minutes: readingMinutes(words), body: text, body_html: form.body_html || "<p></p>",
    source_name: form.source_name, source_url: form.source_url, cta: buildCta(topic, form.cta_level, form.cta_goal), related: [],
  };
  const cta = previewData.cta!;

  return <section className="news-editor-page">
    <div className="news-editor-bar">
      <Button type="button" variant="ghost" onClick={back}><ArrowLeft data-icon="inline-start" />{t("Quay lại danh sách")}</Button>
      <div className="news-editor-buttons">
        <Button type="button" variant="outline" onClick={() => setPreview((p) => !p)}>
          {preview ? <><Pencil data-icon="inline-start" />{t("Tiếp tục soạn")}</> : <><Eye data-icon="inline-start" />{t("Xem trước")}</>}
        </Button>
        {published
          ? <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm("unpublish")}>{t("Gỡ xuống")}</Button>
            <Button type="button" disabled={busy || !!uploads} onClick={() => save(true)}>{t("Cập nhật bài")}</Button>
          </>
          : <>
            <Button type="button" variant="outline" disabled={busy || !!uploads} onClick={() => save(false)}>{t("Lưu nháp")}</Button>
            <Button type="button" disabled={busy || !!uploads || !check.canPublish} onClick={() => save(true)}>{t("Lưu & đăng")}</Button>
          </>}
      </div>
    </div>
    {restore && <div className="news-restore" role="status">
      <span>Có bản đang soạn dở lúc {formatClock(new Date(restore.at))}.</span>
      <Button size="sm" onClick={() => { setForm(restore.form); setText(htmlToText(restore.form.body_html)); setEditorKey((k) => k + 1); setRestore(null); }}>{t("Khôi phục")}</Button>
      <Button size="sm" variant="outline" onClick={() => { try { localStorage.removeItem(key); } catch { /* ignore */ } setRestore(null); }}>{t("Bỏ")}</Button>
    </div>}
    {error && <div role="alert" className="news-editor-error"><ErrorState error={error} />{!!problems.length && <ul className="news-problems">{problems.map((m) => <li key={m}>{m}</li>)}</ul>}</div>}
    {preview && <NewsArticle post={previewData} preview />}
    <div className="news-editor-grid" hidden={preview}>
      <form className="news-editor-form" onSubmit={(e) => e.preventDefault()}>
        <h2>{post ? "Sửa bài viết" : "Bài viết mới"}{post?.origin === "auto" && <span className="news-origin"> {t("· do n8n tạo")}</span>}</h2>
        <Field>
          <FieldLabel htmlFor="news-title">{t("Tiêu đề *")}</FieldLabel>
          <Input id="news-title" value={form.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} />
          <span className="news-counter">{form.title.length}/160</span>
        </Field>
        <Field>
          <FieldLabel htmlFor="news-summary">{t("Tóm tắt *")}</FieldLabel>
          <Textarea id="news-summary" value={form.summary} maxLength={500} rows={3} onChange={(e) => set({ summary: e.target.value })} />
          <span className="news-counter">{form.summary.length}/500</span>
        </Field>
        <fieldset className="news-topic-field">
          <legend>{t("Chủ đề *")}</legend>
          {NEWS_TOPICS.map((t) => <label key={t.id}>
            <input type="radio" name="news-topic" value={t.id} checked={form.topic === t.id} onChange={() => set({ topic: t.id })} />{t.label}
          </label>)}
        </fieldset>
        <CoverField form={form} set={set} uploading={(b) => setUploads((n) => n + (b ? 1 : -1))} />
        <div className="news-body-field">
          <span className="news-field-label" id="news-body-label">{t("Nội dung *")}</span>
          <Suspense fallback={<Loading />}>
            <RichEditor key={editorKey} id="news-body" initial={form.body_html} invalid={false}
              imageUploadUrl={NEWS_IMAGE_UPLOAD} imageBasePath={NEWS_IMAGE_BASE}
              change={(html, plain) => { set({ body_html: html }); setText(plain); }}
              uploading={(b) => setUploads((n) => n + (b ? 1 : -1))} />
          </Suspense>
          <span className="news-counter">{words} chữ · khoảng {readingMinutes(words)} phút đọc</span>
        </div>
        <fieldset className="news-source-field">
          <legend>{t("Nguồn bài gốc")}</legend>
          <div className="news-field-pair">
            <Field><FieldLabel htmlFor="news-source-name">{t("Tên báo")}</FieldLabel>
              <Input id="news-source-name" value={form.source_name} maxLength={120} onChange={(e) => set({ source_name: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="news-source-url">{t("Liên kết bài gốc")}</FieldLabel>
              <Input id="news-source-url" type="url" inputMode="url" placeholder="https://…" value={form.source_url} maxLength={500} onChange={(e) => set({ source_url: e.target.value })} /></Field>
          </div>
        </fieldset>
        <fieldset className="news-cta-field">
          <legend>{t("Lời mời tìm gia sư")}</legend>
          <div className="news-field-pair">
            <Choose label="Cấp học" value={form.cta_level} onChange={(v) => set({ cta_level: v })} allLabel="Mặc định theo chủ đề"
              options={NEWS_LEVELS.map((v) => ({ value: v, label: v }))} />
            <Choose label="Mục tiêu kỳ thi" value={form.cta_goal} onChange={(v) => set({ cta_goal: v })} allLabel="Không lọc"
              options={[...new Set(goals.data?.map((r) => r.category))].map((v) => ({ value: v, label: v }))} />
          </div>
          <p className="news-cta-preview">Xem trước: “{cta.heading}” → {cta.button}</p>
        </fieldset>
        <label className="post-publish"><input type="checkbox" checked={form.pin} onChange={(e) => set({ pin: e.target.checked })} />{t("Ghim lên đầu trang Tin tức (chỉ khi đăng)")}</label>
        <div className="news-editor-foot">
          {post && <Button type="button" variant="ghost" className="danger-text" disabled={busy} onClick={() => setConfirm("delete")}>{t("Xóa bài viết")}</Button>}
        </div>
      </form>
      <aside className="news-checklist" aria-label="Kiểm tra trước khi đăng">
        <h3>{t("Kiểm tra trước khi đăng")}</h3>
        <ul>
          {check.required.map((r) => <li key={r.good} data-state={r.ok ? "ok" : "bad"}>{r.ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}{r.ok ? r.good : r.bad}</li>)}
          {check.warnings.map((w) => <li key={w} data-state="warn"><TriangleAlert size={14} aria-hidden="true" />{w}</li>)}
        </ul>
        <p>{t("Phím tắt: Ctrl/Cmd + S để lưu.")}</p>
      </aside>
    </div>
    {confirm === "leave" && <ConfirmDialog title="Rời khỏi bài viết?" description="Bài có thay đổi chưa lưu. Nếu rời đi, thay đổi sẽ không được lưu lên máy chủ." confirm="Rời đi" busy={false}
      onCancel={() => setConfirm(null)} onConfirm={() => close()} />}
    {confirm === "unpublish" && <ConfirmDialog title="Gỡ bài xuống?" description="Bài sẽ không còn hiện với người đọc. Đường dẫn được giữ nguyên nếu đăng lại." confirm="Gỡ xuống" busy={busy}
      onCancel={() => setConfirm(null)} onConfirm={() => act(`/admin/posts/${post!.id}/unpublish`, "POST", "Đã gỡ bài xuống", post!.origin === "auto" ? "review" : "drafts")} />}
    {confirm === "delete" && <ConfirmDialog danger title="Xóa bài viết?" description="Bài sẽ bị xóa hẳn và không thể khôi phục." confirm="Xóa bài" busy={busy}
      onCancel={() => setConfirm(null)} onConfirm={() => act(`/admin/posts/${post!.id}`, "DELETE", "Đã xóa bài", undefined)} />}
  </section>;
}

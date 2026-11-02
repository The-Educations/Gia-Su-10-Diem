import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useLoad } from "@/lib/api";
import type { Post } from "@/lib/types";
import { Loading, ErrorState, Blank, Submit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export default function AdminPosts() {
  const result = useLoad<Post[]>("/admin/posts");
  const [editor, setEditor] = useState<Post | null | undefined>(undefined);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(editor ? `/admin/posts/${editor.id}` : "/admin/posts", editor ? "PUT" : "POST", { ...data, published: data.published === "on" });
      setEditor(undefined); result.reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (result.loading) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={result.reload} />;
  return <section>
    {error && <ErrorState error={error} />}
    {editor !== undefined ? <form className="news-editor" onSubmit={save} key={editor?.id || "new"}>
      <h2>{editor ? "Sửa bài viết" : "Bài viết mới"}</h2>
      <FieldGroup>
        <Field><FieldLabel htmlFor="post-title">Tiêu đề</FieldLabel><Input id="post-title" name="title" defaultValue={editor?.title} required maxLength={160} /></Field>
        <Field><FieldLabel htmlFor="post-summary">Tóm tắt</FieldLabel><Textarea id="post-summary" name="summary" defaultValue={editor?.summary} required maxLength={500} /></Field>
        <Field><FieldLabel htmlFor="post-body">Nội dung</FieldLabel><Textarea id="post-body" name="body" defaultValue={editor?.body} required maxLength={30000} rows={16} /></Field>
        <label className="post-publish"><input type="checkbox" name="published" defaultChecked={!!editor?.published} />Công khai bài viết</label>
        <div className="setup-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditor(undefined); setError(""); }}>Hủy</Button><Submit busy={busy}>Lưu bài viết</Submit></div>
      </FieldGroup>
    </form> : <>
      <Button onClick={() => { setEditor(null); setError(""); }}>Viết bài mới</Button>
      {!result.data?.length ? <Blank title="Chưa có bài viết" /> : <div className="news-list">{result.data.map(post => <article key={post.id}>
        <h2>{post.title}</h2><p>{post.published ? "Đã công khai" : "Bản nháp"}</p>
        <div className="setup-actions"><Button variant="outline" onClick={() => setEditor(post)}>Sửa bài viết</Button>{!!post.published && <Link className="text-link" to={`/news/${post.id}`}>Xem bài viết</Link>}</div>
      </article>)}</div>}
    </>}
  </section>;
}

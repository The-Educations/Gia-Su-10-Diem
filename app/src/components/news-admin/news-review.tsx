import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, Pin, PinOff, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api, useLoad } from "@/lib/api";
import type { AdminNewsList, AdminNewsPost, AdminNewsRow, NewsTab } from "@/lib/types";
import { Blank, ErrorState, Loading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { newsPath, relativeOrDate } from "@/lib/news";
import { topicLabel } from "@/lib/news-topics";
import { NewsCover } from "@/components/news/news-cards";
import { ConfirmDialog } from "./confirm-dialog";
import { useI18n } from "@/lib/i18n";

const TABS: { id: NewsTab; label: string; empty: string }[] = [
  { id: "review", label: "Chờ duyệt", empty: "Không có bài chờ duyệt. n8n chạy 3 giờ một lần." },
  { id: "drafts", label: "Nháp", empty: "Chưa có bản nháp. Bấm “Viết bài mới” để bắt đầu." },
  { id: "published", label: "Đã đăng", empty: "Chưa có bài nào được đăng." },
];
type Pending = { kind: "delete" | "unpublish"; post: AdminNewsRow };

export default function NewsReview({ edit }: { edit: (id: number | "new") => void }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const asked = params.get("news");
  const tab: NewsTab = TABS.some((t) => t.id === asked) ? (asked as NewsTab) : "review";
  const result = useLoad<AdminNewsList>(`/admin/posts?tab=${tab}`);
  const [busy, setBusy] = useState<number | null>(null), [error, setError] = useState("");
  const [problems, setProblems] = useState<Record<number, string[]>>({}), [pending, setPending] = useState<Pending | null>(null);
  const goTab = (next: NewsTab) => setParams((p) => { const q = new URLSearchParams(p); q.set("news", next); return q; }, { replace: true });
  // Keep the last counts on screen while another tab loads.
  const [counts, setCounts] = useState<AdminNewsList["counts"] | null>(null);
  useEffect(() => { if (result.data) setCounts(result.data.counts); }, [result.data]);
  // First visit with nothing waiting for review: open the published list instead of an empty tab.
  useEffect(() => {
    if (!asked && result.data && result.data.counts.review === 0 && result.data.counts.published > 0) goTab("published");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, result.data]);

  async function run(post: AdminNewsRow, path: string, method: string, body?: unknown, success?: string) {
    setBusy(post.id); setError(""); setProblems((p) => ({ ...p, [post.id]: [] }));
    try {
      await api<AdminNewsPost | { ok: true }>(path, method, body);
      if (success) toast.success(success);
      setPending(null); result.reload();
    } catch (e) {
      const err = e as Error & { problems?: string[] };
      if (err.problems?.length) setProblems((p) => ({ ...p, [post.id]: err.problems! }));
      else setError(err.message);
      setPending(null);
    } finally { setBusy(null); }
  }

  return <section className="news-admin">
    <header className="news-admin-head">
      <h2>{t("Tin tức")}</h2>
      <Button onClick={() => edit("new")}><Plus data-icon="inline-start" />{t("Viết bài mới")}</Button>
    </header>
    <div className="news-admin-tabs" role="tablist" aria-label="Trạng thái bài viết">
      {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => goTab(t.id)}>
        {t.label}{counts ? ` (${counts[t.id]})` : ""}
      </button>)}
    </div>
    {error && <ErrorState error={error} />}
    {result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.reload} />
      : !result.data?.items.length ? <Blank title={TABS.find((t) => t.id === tab)!.empty} />
      : <ul className="news-admin-list">{result.data.items.map((post) => {
        const own = problems[post.id] ?? [], disabled = busy === post.id;
        return <li key={post.id} className="news-admin-row">
          <div className="news-admin-thumb"><NewsCover src={post.cover_url} alt="" topic={post.topic} /></div>
          <div className="news-admin-info">
            <h3>{post.pinned ? <Pin size={14} aria-label="Đang ghim" /> : null}{post.title}</h3>
            <p className="news-meta">
              {topicLabel(post.topic)}
              {post.source_name && <> · {/^https?:\/\//.test(post.source_url)
                ? <a href={post.source_url} target="_blank" rel="noopener noreferrer nofollow">{post.source_name}<ExternalLink size={12} /></a> : post.source_name}</>}
              {" · "}{post.published ? `đăng ${relativeOrDate(post.published_at)}` : `tạo ${relativeOrDate(post.created_at)}`}
            </p>
            {post.warnings.map((w) => <p className="news-warning" key={w}><TriangleAlert size={14} aria-hidden="true" />{w}</p>)}
            {!!own.length && <ul className="news-problems" role="alert">{own.map((m) => <li key={m}>{m}</li>)}</ul>}
            <div className="news-admin-actions">
              {tab !== "published" && <Button size="sm" disabled={disabled} onClick={() => run(post, `/admin/posts/${post.id}/publish`, "POST", {}, "Đã đăng bài")}>{t("Duyệt & đăng")}</Button>}
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => edit(post.id)}>{t("Sửa")}</Button>
              {tab === "published" && <>
                <Button size="sm" variant="outline" asChild><Link to={newsPath(post)}>Xem</Link></Button>
                <Button size="sm" variant="outline" disabled={disabled}
                  onClick={() => run(post, `/admin/posts/${post.id}/pin`, "POST", { pinned: !post.pinned }, post.pinned ? "Đã bỏ ghim" : "Đã ghim lên đầu trang Tin tức")}>
                  {post.pinned ? <><PinOff data-icon="inline-start" />{t("Bỏ ghim")}</> : <><Pin data-icon="inline-start" />Ghim</>}
                </Button>
                <Button size="sm" variant="outline" disabled={disabled} onClick={() => setPending({ kind: "unpublish", post })}>{t("Gỡ xuống")}</Button>
              </>}
              <Button size="sm" variant="ghost" className="danger-text" disabled={disabled} onClick={() => setPending({ kind: "delete", post })}>{t("Xóa")}</Button>
            </div>
          </div>
        </li>;
      })}</ul>}
    {pending && <ConfirmDialog
      busy={busy === pending.post.id} danger={pending.kind === "delete"}
      title={pending.kind === "delete" ? "Xóa bài viết?" : "Gỡ bài xuống?"}
      description={pending.kind === "delete"
        ? `Bài “${pending.post.title}” sẽ bị xóa hẳn và không thể khôi phục.`
        : `Bài “${pending.post.title}” sẽ không còn hiện với người đọc. Đường dẫn được giữ nguyên nếu đăng lại.`}
      confirm={pending.kind === "delete" ? "Xóa bài" : "Gỡ xuống"}
      onCancel={() => setPending(null)}
      onConfirm={() => pending.kind === "delete"
        ? run(pending.post, `/admin/posts/${pending.post.id}`, "DELETE", undefined, "Đã xóa bài")
        : run(pending.post, `/admin/posts/${pending.post.id}/unpublish`, "POST", {}, "Đã gỡ bài xuống")} />}
  </section>;
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, dateTime, useLoad } from "@/lib/api";
import type { CommunityDraft } from "@/lib/types";
import { Loading, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";

export default function Drafts() {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const result = useLoad<{ items: CommunityDraft[]; more: boolean }>(
    `/community/drafts?page=${page}`,
  );
  return (
    <section className="community-feed" aria-label="Bản nháp">
      <div className="community-write-header">
        <h2 className="community-group-title">Bản nháp</h2>
        <Button asChild size="sm">
          <Link to="/community/write">Viết bài</Link>
        </Button>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : !result.data?.items.length ? (
        <p className="community-drafts-empty">Chưa có bản nháp.</p>
      ) : (
        result.data.items.map((d) => (
          <article className="community-card community-draft-card" key={d.id}>
            <div>
              <h3>
                <Link to={`/community/write?draft=${d.id}`}>
                  {d.title || "Bản nháp chưa có tiêu đề"}
                </Link>
              </h3>
              <time dateTime={d.updated_at.replace(" ", "T") + "Z"}>
                {dateTime(d.updated_at)}
              </time>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy}
              aria-label={`Xóa nháp: ${d.title || "Chưa có tiêu đề"}`}
              onClick={async () => {
                if (!window.confirm("Xóa bản nháp này?")) return;
                setBusy(d.id);
                setError("");
                try {
                  await api(`/community/drafts/${d.id}`, "DELETE", {
                    version: d.version,
                  });
                  toast.success("Đã xóa bản nháp");
                  if (result.data!.items.length === 1 && page > 1)
                    setPage(page - 1);
                  else result.reload();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Xóa nháp
            </Button>
          </article>
        ))
      )}
      {error && <ErrorState error={error} />}
      {(page > 1 || result.data?.more) && (
        <nav className="community-pagination" aria-label="Trang bản nháp">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Trang trước
          </Button>
          <span>Trang {page}</span>
          <Button
            variant="outline"
            disabled={!result.data?.more}
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </Button>
        </nav>
      )}
    </section>
  );
}

import { useNavigate, useSearchParams } from "react-router-dom";
import { useLoad } from "@/lib/api";
import type { CommunityDraft } from "@/lib/types";
import { Page, Loading, ErrorState } from "@/components/common";
import Compose from "@/components/community/Compose";

export default function CommunityWrite() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get("draft");
  const result = useLoad<CommunityDraft>(
    id ? `/community/drafts/${encodeURIComponent(id)}` : null,
  );
  return (
    <Page>
      <div className="community-page">
        {id && result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorState error={result.error} retry={result.reload} />
        ) : (
          <Compose
            key={id || "new"}
            page
            draft={id ? result.data || undefined : undefined}
            close={() => navigate("/community/mine")}
            saved={(post) => navigate(`/community/${post.id}`)}
          />
        )}
      </div>
    </Page>
  );
}

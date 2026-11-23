import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loading } from "@/components/common";
import NewsReview from "@/components/news-admin/news-review";

const NewsEditor = lazy(() => import("@/components/news-admin/news-editor"));

// Admin → Tin tức: review list (3 tabs in the URL) and the article editor.
export default function AdminPosts() {
  const [, setParams] = useSearchParams();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  if (editing === null) return <NewsReview edit={setEditing} />;
  return <Suspense fallback={<Loading />}>
    <NewsEditor key={editing} id={editing} close={(tab) => {
      if (tab) setParams((p) => { const q = new URLSearchParams(p); q.set("news", tab); return q; }, { replace: true });
      setEditing(null);
    }} />
  </Suspense>;
}

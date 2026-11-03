import { useState } from "react";
import { api, useLoad } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common";

export default function PendingMail() {
  const [page, setPage] = useState(1);
  const result = useLoad<{ id: number; detail: string; name: string }[]>(`/admin/community/mail?page=${page}`);
  const [busy, setBusy] = useState<number | null>(null), [error, setError] = useState("");
  if (result.error) return <ErrorState error={result.error} retry={result.reload} />;
  if (!result.data?.length && page === 1) return null;
  return <section className="community-review-card" aria-label="Email chưa gửi">
    <h2>Email chưa gửi</h2>
    {result.data?.map(item => <div className="list-toolbar" key={item.id}>
      <p><strong>{item.name}</strong> · {item.detail}</p>
      <Button variant="outline" disabled={busy !== null} onClick={async () => {
        setBusy(item.id); setError("");
        try {
          const response = await api<{ email_status: string }>(`/admin/community/mail/${item.id}/retry`, "POST", {});
          if (response.email_status !== "sent") setError("Chưa gửi được email. Kiểm tra cấu hình hộp thư admin và thử lại sau một phút.");
          result.reload();
        } catch (e) { setError((e as Error).message); }
        finally { setBusy(null); }
      }}>{busy === item.id ? "Đang gửi…" : "Gửi lại email"}</Button>
    </div>)}
    <div className="actions"><Button variant="ghost" disabled={page === 1 || busy !== null} onClick={() => setPage(p => p - 1)}>Trước</Button><span>Trang {page}</span><Button variant="ghost" disabled={result.data?.length !== 20 || busy !== null} onClick={() => setPage(p => p + 1)}>Tiếp</Button></div>
    {error && <ErrorState error={error} />}
  </section>;
}

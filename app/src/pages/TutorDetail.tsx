import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useLoad } from "@/lib/api";
import type { Tutor, Subject } from "@/lib/types";
import { Page, Loading, ErrorState, Blank } from "@/components/common";
import { Button } from "@/components/ui/button";
import { TutorProfileView } from "@/components/tutor-profile-view";
import { useI18n } from "@/lib/i18n";

export default function TutorDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const result = useLoad<Tutor>(`/tutors/${id}`), subjects = useLoad<Subject[]>("/subjects");
  if (result.loading || subjects.loading) return <Loading />;
  if (result.reason === "not_found")
    return <Page><Link className="back-link" to="/tutors"><ArrowLeft size={16} />{t("Tìm gia sư")}</Link>
      <Blank title={t("Không tìm thấy gia sư này.")} action={<Button asChild variant="outline"><Link to="/tutors">{t("Tìm gia sư khác")}</Link></Button>} />
    </Page>;
  if (result.reason === "unpublished")
    return <Page><Link className="back-link" to="/tutors"><ArrowLeft size={16} />{t("Tìm gia sư")}</Link>
      <ErrorState error={result.error} />
    </Page>;
  if (result.error || subjects.error || !result.data) return <ErrorState error={result.error || subjects.error} retry={() => { result.reload(); subjects.reload(); }} />;
  return <Page><Link className="back-link" to="/tutors"><ArrowLeft size={16} />{t("Tìm gia sư")}</Link>
    <TutorProfileView tutor={result.data} subjects={subjects.data || []} />
  </Page>;
}

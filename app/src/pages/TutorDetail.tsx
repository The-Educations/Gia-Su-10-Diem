import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useLoad } from "@/lib/api";
import type { Tutor, Subject } from "@/lib/types";
import { Page, Loading, ErrorState } from "@/components/common";
import { TutorProfileView } from "@/components/tutor-profile-view";

export default function TutorDetail() {
  const { id } = useParams();
  const result = useLoad<Tutor>(`/tutors/${id}`), subjects = useLoad<Subject[]>("/subjects");
  if (result.loading || subjects.loading) return <Loading />;
  if (result.error || subjects.error || !result.data) return <ErrorState error={result.error || subjects.error} retry={() => { result.reload(); subjects.reload(); }} />;
  return <Page><Link className="back-link" to="/tutors"><ArrowLeft size={16} />Tìm gia sư</Link>
    <TutorProfileView tutor={result.data} subjects={subjects.data || []} />
  </Page>;
}

import { ScheduleEditor } from "@/components/weekly-availability";
import { Page, Heading, Loading, ErrorState } from "@/components/common";
import { useLoad } from "@/lib/api";
import type { WeeklySchedule } from "@/lib/types";
export default function Availability() {
  const result = useLoad<WeeklySchedule>("/account/availability");
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  return <Page><Heading title="Lịch rảnh của tôi" />
    <div className="studio-availability"><ScheduleEditor initial={result.data} endpoint="/account/availability" /></div>
  </Page>;
}

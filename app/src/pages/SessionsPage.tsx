import { AdminSessions } from "@/components/admin-sessions";
import { Page, Heading } from "@/components/common";
import { useI18n } from "@/lib/i18n";

// The admin sessions worklist as its own destination: class lessons and
// standalone bookings in one queue with a small tracking strip on top.
export default function SessionsPage() {
  const { t } = useI18n();
  return (
    <Page>
      <Heading title={t("Buổi học")} />
      <AdminSessions standalone />
    </Page>
  );
}

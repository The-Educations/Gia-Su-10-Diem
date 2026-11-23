import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AdminData, Tutor } from "@/lib/types";
import {
  Page,
  Heading,
  Loading,
  ErrorState,
  Choose,
  Blank,
} from "@/components/common";
import { WeeklyAvailability } from "@/components/weekly-availability";
import { AvailabilityGrid, scheduleKeys } from "@/components/availability-grid";
import { Button } from "@/components/ui/button";

export default function TutorCalendar() {
  const { user } = useApp(), t = useI18n().t;
  const profile = useLoad<Tutor>(
    user?.role === "tutor" ? "/tutor/profile" : null,
  );
  const admin = useLoad<AdminData>(user?.role === "admin" ? "/admin" : null);
  const [selected, setSelected] = useState("");
  if (user?.role === "student") return <Navigate to="/availability" replace />;
  const tutors = admin.data?.tutors || [];
  const tutor = tutors.find((tu) => String(tu.user_id) === selected) || tutors[0];
  return (
    <Page>
      <Heading
        title={user?.role === "tutor" ? t("Giờ trống hằng tuần") : t("Lịch dạy")}
        action={
          <Button variant="outline" asChild>
            <Link to="/classes">{user?.role === "tutor" ? t("Lịch dạy của tôi") : t("Quản lý buổi học")}</Link>
          </Button>
        }
      />
      {profile.loading || admin.loading ? (
        <Loading />
      ) : profile.error || admin.error ? (
        <ErrorState
          error={profile.error || admin.error}
          retry={() => {
            profile.reload();
            admin.reload();
          }}
        />
      ) : user?.role === "tutor" && profile.data ? (
        <WeeklyAvailability tutor={profile.data} />
      ) : tutor ? (
        <>
          <div className="calendar-tutor-picker">
            <Choose
              label={t("Gia sư")}
              value={String(tutor.user_id)}
              onChange={setSelected}
              options={tutors.map((tu) => ({
                value: String(tu.user_id),
                label: tu.name,
              }))}
            />
          </div>
          <div className="availability-toolbar">
            <span>{t("Giờ trống hằng tuần · Giờ Việt Nam")}</span>
            <span>{t("{n} giờ / tuần", { n: tutor.weekly_blocks.length })}</span>
          </div>
          <AvailabilityGrid
            selected={scheduleKeys({
              blocks: tutor.weekly_blocks,
              revision: 0,
            })}
            setSelected={() => {}}
            busy
          />
        </>
      ) : (
        <Blank title={t("Chưa có lịch dạy")} />
      )}
    </Page>
  );
}

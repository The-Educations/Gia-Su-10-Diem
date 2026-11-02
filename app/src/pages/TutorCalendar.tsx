import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useApp, useLoad } from "@/lib/api";
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
  const { user } = useApp();
  const profile = useLoad<Tutor>(
    user?.role === "tutor" ? "/tutor/profile" : null,
  );
  const admin = useLoad<AdminData>(user?.role === "admin" ? "/admin" : null);
  const [selected, setSelected] = useState("");
  if (user?.role === "student") return <Navigate to="/availability" replace />;
  const tutors = admin.data?.tutors || [];
  const tutor = tutors.find((t) => String(t.user_id) === selected) || tutors[0];
  return (
    <Page>
      <Heading
        title={user?.role === "tutor" ? "Giờ trống hằng tuần" : "Lịch dạy"}
        action={
          <Button variant="outline" asChild>
            <Link to="/bookings">{user?.role === "tutor" ? "Lịch dạy của tôi" : "Quản lý buổi học"}</Link>
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
              label="Gia sư"
              value={String(tutor.user_id)}
              onChange={setSelected}
              options={tutors.map((t) => ({
                value: String(t.user_id),
                label: t.name,
              }))}
            />
          </div>
          <div className="availability-toolbar">
            <span>Giờ trống hằng tuần · Giờ Việt Nam</span>
            <span>{tutor.weekly_blocks.length} giờ / tuần</span>
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
        <Blank title="Chưa có lịch dạy" />
      )}
    </Page>
  );
}

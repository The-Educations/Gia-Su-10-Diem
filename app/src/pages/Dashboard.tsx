import { TodayPanel } from "@/components/today-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MessageCircle, ArrowUpRight } from "lucide-react";
import { useApp, useLoad, money } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Booking, Inquiry, Tutor } from "@/lib/types";
import {
  Page,
  Heading,
  Person,
  State,
  Blank,
  Loading,
  ErrorState,
  TextLink,
} from "@/components/common";
import { WorkspacePanel } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
export default function Dashboard() {
  const { user } = useApp(), t = useI18n().t,
    profile = useLoad<Tutor>(user?.role === "tutor" ? "/tutor/profile" : null),
    favorites = useLoad<number[]>(
      user?.role === "student" ? "/favorites" : null,
    ),
    tutors = useLoad<Tutor[]>(user?.role === "student" ? "/tutors" : null),
    inquiries = useLoad<Inquiry[]>(
      user?.role === "admin" ? null : "/inquiries",
    );
  if (!user) return null;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  const isTutor = user.role === "tutor",
    saved = (tutors.data || []).filter((t) =>
      favorites.data?.includes(t.user_id),
    ),
    prof = profile.data;
  const readiness = prof
      ? [
          !!prof.headline,
          !!prof.bio,
          !!prof.education,
          prof.subjects.length > 0,
          prof.slots.some(
            (s) => !s.reserved && new Date(s.starts_at) > new Date(),
          ),
        ]
      : [],
    ready = readiness.filter(Boolean).length;
  return (
    <Page>
      <Heading
        title={isTutor ? t("Không gian gia sư") : user.learner_type === "parent" ? t("Không gian phụ huynh") : t("Góc học tập")}
        action={
          <Button asChild>
            <Link to={isTutor ? "/studio?tab=slots" : "/tutors"}>
              {isTutor ? t("Mở giờ trống") : t("Tìm gia sư")}
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        }
      />
      {!isTutor && (!user.school || !user.ward_code) && <Alert><AlertDescription><Link to="/settings">{t("Hoàn thiện hồ sơ: trường học & nơi sinh sống")}</Link></AlertDescription></Alert>}
      <TodayPanel />
      <div className="workspace-lower">
        <div className="workspace-side">
          {isTutor ? (
            <WorkspacePanel
              title={t("Hồ sơ nhận dạy")}
              action={<TextLink to="/studio?tab=profile">{t("Chỉnh sửa")}</TextLink>}
            >
              {profile.error ? (
                <ErrorState error={profile.error} retry={profile.reload} />
              ) : prof ? (
                <>
                  <div className="profile-readiness">
                    <Person
                      name={user.name}
                      src={prof.photo_url || undefined}
                      large
                    />
                    <div>
                      <strong>{user.name}</strong>
                      <State
                        value={
                          prof.status === "pending" ? "pending_profile" : prof.status
                        }
                      />
                    </div>
                  </div>
                  <div className="readiness-label">
                    <span>{t("Thông tin & giờ trống")}</span>
                    <strong>{ready}/5</strong>
                  </div>
                  <Progress
                    value={ready * 20}
                    aria-label={t("Mức hoàn thiện thông tin hồ sơ")}
                  />
                  <div className="readiness-links">
                    <Link to="/studio?tab=profile">
                      Ảnh hồ sơ
                      <ArrowUpRight size={16} />
                    </Link>
                    <Link to="/studio?tab=slots">
                      {
                        prof.slots.filter(
                          (s) =>
                            !s.reserved && new Date(s.starts_at) > new Date(),
                        ).length
                      }{" "}
                      giờ trống
                      <ArrowUpRight size={16} />
                    </Link>
                  </div>
                </>
              ) : (
                <Loading />
              )}
            </WorkspacePanel>
          ) : (
            <WorkspacePanel
              title={t("Gia sư đã lưu")}
              action={<TextLink to="/favorites">{t("Xem tất cả")}</TextLink>}
            >
              {favorites.error || tutors.error ? (
                <ErrorState
                  error={favorites.error || tutors.error}
                  retry={() => {
                    favorites.reload();
                    tutors.reload();
                  }}
                />
              ) : favorites.loading || tutors.loading ? (
                <Loading />
              ) : saved.length ? (
                <div className="saved-preview">
                  {saved.slice(0, 3).map((tu) => (
                    <Link to={`/tutors/${tu.user_id}`} key={tu.user_id}>
                      <Person name={tu.name} src={tu.photo_url || undefined} />
                      <div>
                        <strong>{tu.name}</strong>
                        <span>{money(tu.rate)} / buổi</span>
                      </div>
                      <ArrowUpRight size={16} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Blank
                  title={t("Chưa lưu gia sư")}
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link to="/tutors">{t("Tìm gia sư")}</Link>
                    </Button>
                  }
                />
              )}
            </WorkspacePanel>
          )}
          <WorkspacePanel
            title={t("Trao đổi gần đây")}
            action={<TextLink to="/messages">{t("Mở tin nhắn")}</TextLink>}
          >
            {inquiries.error ? (
              <ErrorState error={inquiries.error} retry={inquiries.reload} />
            ) : inquiries.loading ? (
              <Loading />
            ) : inquiries.data?.length ? (
              <div className="saved-preview">
                {inquiries.data.slice(0, 2).map((i) => (
                  <Link to={`/messages?inquiry=${i.id}`} key={i.id}>
                    <MessageCircle size={20} />
                    <div>
                      <strong>{isTutor ? i.student_name : i.tutor_name}</strong>
                      <span>{i.last_message || t("Bắt đầu trò chuyện")}</span>
                    </div>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
              </div>
            ) : (
              <Blank title={t("Chưa có trao đổi tư vấn")} />
            )}
          </WorkspacePanel>
        </div>
      </div>
    </Page>
  );
}

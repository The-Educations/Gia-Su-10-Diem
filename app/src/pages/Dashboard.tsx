import { TodayPanel } from "@/components/today-panel";
import type { StudyOffer } from "@/lib/offers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MessageCircle, ArrowUpRight } from "lucide-react";
import { useApp, useLoad, money } from "@/lib/api";
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
import { CoursesToReview, CourseReviewDialog } from "@/components/trust";
export default function Dashboard() {
  const [reviewing, setReviewing] = useState<StudyOffer | null>(null);
  const { user } = useApp(),
    bookings = useLoad<Booking[]>("/bookings"),
    offers = useLoad<StudyOffer[]>(user?.role === "admin" ? null : "/offers"),
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
  if (bookings.loading) return <Loading />;
  if (bookings.error)
    return <ErrorState error={bookings.error} retry={bookings.reload} />;
  if (offers.error)
    return <ErrorState error={offers.error} retry={offers.reload} />;
  const isTutor = user.role === "tutor",
    rows = bookings.data || [],
    upcoming = rows
      .filter(
        (b) =>
          ["accepted", "pending"].includes(b.status) &&
          new Date(b.starts_at) > new Date(),
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    next = upcoming.find((b) => b.status === "accepted") || upcoming[0],
    pendingOffers = (offers.data || []).filter(o=>o.status === "pending"),
    pending = upcoming.filter((b) => b.status === "pending"),
    saved = (tutors.data || []).filter((t) =>
      favorites.data?.includes(t.user_id),
    ),
    t = profile.data;
  const readiness = t
      ? [
          !!t.headline,
          !!t.bio,
          !!t.education,
          t.subjects.length > 0,
          t.slots.some(
            (s) => !s.reserved && new Date(s.starts_at) > new Date(),
          ),
        ]
      : [],
    ready = readiness.filter(Boolean).length;
  return (
    <Page>
      <Heading
        title={isTutor ? "Không gian gia sư" : user.learner_type === "parent" ? "Không gian phụ huynh" : "Góc học tập"}
        action={
          <Button asChild>
            <Link to={isTutor ? "/studio?tab=slots" : "/tutors"}>
              {isTutor ? "Mở giờ trống" : "Tìm gia sư"}
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        }
      />
      {!isTutor && (!user.school || !user.ward_code) && <Alert><AlertDescription><Link to="/settings">Hoàn thiện hồ sơ: trường học & nơi sinh sống</Link></AlertDescription></Alert>}
      <TodayPanel />
      {!isTutor && <CoursesToReview offers={offers.data || []} onReview={setReviewing} />}
      <CourseReviewDialog offer={reviewing} onClose={() => setReviewing(null)} onDone={() => { offers.reload(); bookings.reload(); }} />
      <div className="workspace-lower">
        <div className="workspace-side">
          {isTutor ? (
            <WorkspacePanel
              title="Hồ sơ nhận dạy"
              action={<TextLink to="/studio?tab=profile">Chỉnh sửa</TextLink>}
            >
              {profile.error ? (
                <ErrorState error={profile.error} retry={profile.reload} />
              ) : t ? (
                <>
                  <div className="profile-readiness">
                    <Person
                      name={user.name}
                      src={t.photo_url || undefined}
                      large
                    />
                    <div>
                      <strong>{user.name}</strong>
                      <State
                        value={
                          t.status === "pending" ? "pending_profile" : t.status
                        }
                      />
                    </div>
                  </div>
                  <div className="readiness-label">
                    <span>Thông tin & giờ trống</span>
                    <strong>{ready}/5</strong>
                  </div>
                  <Progress
                    value={ready * 20}
                    aria-label="Mức hoàn thiện thông tin hồ sơ"
                  />
                  <div className="readiness-links">
                    <Link to="/studio?tab=profile">
                      Ảnh hồ sơ
                      <ArrowUpRight size={16} />
                    </Link>
                    <Link to="/studio?tab=slots">
                      {
                        t.slots.filter(
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
              title="Gia sư đã lưu"
              action={<TextLink to="/favorites">Xem tất cả</TextLink>}
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
                  {saved.slice(0, 3).map((t) => (
                    <Link to={`/tutors/${t.user_id}`} key={t.user_id}>
                      <Person name={t.name} src={t.photo_url || undefined} />
                      <div>
                        <strong>{t.name}</strong>
                        <span>{money(t.rate)} / buổi</span>
                      </div>
                      <ArrowUpRight size={16} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Blank
                  title="Chưa lưu gia sư"
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link to="/tutors">Tìm gia sư</Link>
                    </Button>
                  }
                />
              )}
            </WorkspacePanel>
          )}
          <WorkspacePanel
            title="Trao đổi gần đây"
            action={<TextLink to="/messages">Mở tin nhắn</TextLink>}
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
                      <span>{i.last_message || "Bắt đầu trò chuyện"}</span>
                    </div>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
              </div>
            ) : (
              <Blank title="Chưa có trao đổi tư vấn" />
            )}
          </WorkspacePanel>
        </div>
      </div>
    </Page>
  );
}

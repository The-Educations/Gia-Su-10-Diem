import { lessonMessageHref } from "@/lib/message-context";
import type { StudyOffer } from "@/lib/offers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link, Navigate } from "react-router-dom";
import {
  CalendarDays,
  Clock,
  CheckCheck,
  MessageCircle,
  ArrowUpRight,
  BookOpen,
  Heart,
  GraduationCap,
} from "lucide-react";
import { useApp, useLoad, dateTime, money } from "@/lib/api";
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
import {
  WorkspaceStats,
  WorkspacePanel,
  WorkspacePanels,
  WeekAgenda,
} from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TodayLessons } from "@/components/today-lessons";
export default function Dashboard() {
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
      {isTutor && <TodayLessons lessons={rows} role="tutor" onChanged={bookings.reload} />}
      {!isTutor && (!user.school || !user.ward_code) && <Alert><AlertDescription><Link to="/settings">Hoàn thiện hồ sơ: trường học & nơi sinh sống</Link></AlertDescription></Alert>}
      <WorkspaceStats
        items={[
          {
            label: isTutor ? "Buổi dạy sắp tới" : "Buổi học sắp tới",
            value: upcoming.length,
            icon: CalendarDays,
            to: "/bookings",
          },
          {
            label: "Chờ phản hồi",
            value: pending.length + pendingOffers.length,
            icon: Clock,
            to: pendingOffers.length ? "/offers" : "/bookings?status=pending",
          },
          {
            label: "Đã hoàn thành",
            value: rows.filter((b) => b.status === "completed").length,
            icon: CheckCheck,
            to: "/bookings?status=completed",
          },
        ]}
      />
      {!isTutor && <TodayLessons lessons={rows} role="student" onChanged={bookings.reload} />}
      <div className="workspace-overview">
        <WorkspacePanels>
          <section
            className={`next-lesson-panel ${isTutor ? "tutor-next" : ""}`}
          >
            <div className="next-lesson-heading">
              <span>
                <CalendarDays size={18} />
                {isTutor ? "Buổi dạy tiếp theo" : user.learner_type === "parent" ? "Buổi học tiếp theo của con" : "Buổi học tiếp theo"}
              </span>
              {next && <State value={next.status} />}
            </div>
            {next ? (
              <>
                <div className="next-lesson-body">
                  <div className="next-lesson-date">
                    <strong>
                      {new Date(next.starts_at).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}
                    </strong>
                    <span>
                      Tháng{" "}
                      {new Date(next.starts_at).toLocaleDateString("vi-VN", {
                        month: "2-digit",
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}
                    </span>
                  </div>
                  <div>
                    <h2>{next.subject_name}</h2>
                    <p>{isTutor ? next.student_name : next.tutor_name}</p>
                    <span>{dateTime(next.starts_at)} · {next.duration_minutes} phút</span>
                  </div>
                </div>
                <div className="next-lesson-actions">
                  <Button asChild variant="secondary">
                    <Link to={lessonMessageHref(next)}>
                      <MessageCircle data-icon="inline-start" />
                      Trao đổi buổi học
                    </Link>
                  </Button>
                  <Link to={next.offer_id ? `/bookings?offer=${next.offer_id}` : `/bookings?status=${next.status}`}>
                    Xem lịch
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
              </>
            ) : (
              <div className="next-lesson-empty">
                <BookOpen size={32} />
                <h2>
                  {isTutor
                    ? "Sẵn sàng cho buổi dạy mới"
                    : "Chọn gia sư đầu tiên"}
                </h2>
                <Button asChild variant="secondary">
                  <Link to={isTutor ? "/studio?tab=slots" : "/tutors"}>
                    {isTutor ? "Thêm giờ trống" : "Khám phá gia sư"}
                    <ArrowUpRight data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            )}
          </section>
          <WorkspacePanel
            title={isTutor ? "Đề nghị cần phản hồi" : user.learner_type === "parent" ? "Mục tiêu học tập của con" : "Mục tiêu của bạn"}
            action={
              <TextLink to={isTutor ? (pendingOffers.length ? "/offers" : "/bookings?status=pending") : "/settings"}>
                {isTutor ? "Xem tất cả" : "Chỉnh sửa"}
              </TextLink>
            }
          >
            {isTutor ? (
              pending.length || pendingOffers.length ? (
                <div className="request-preview">
                  {pendingOffers.slice(0,3).map(o=><Link to={`/offers?id=${o.id}`} key={`offer-${o.id}`}><Person name={o.student_name} id={o.student_id} /><div><strong>{o.student_name}</strong><span>{o.subject_name} · {o.blocks.length} giờ / tuần</span></div><ArrowUpRight size={18} /></Link>)}
                  {pending.slice(0, 3).map((b) => (
                    <Link to="/bookings?status=pending" key={b.id}>
                      <Person name={b.student_name} id={b.student_id} />
                      <div>
                        <strong>{b.student_name}</strong>
                        <span>
                          {b.subject_name} · {dateTime(b.starts_at)}
                        </span>
                      </div>
                      <ArrowUpRight size={18} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Blank title="Không có yêu cầu đang chờ" />
              )
            ) : (
              <div className="student-goal">
                <BookOpen size={28} />
                <p>{user.goal || "Đặt mục tiêu để tìm gia sư phù hợp."}</p>
                <div className="workspace-shortcuts">
                  <Link to="/library">
                    <GraduationCap size={18} />
                    Tìm môn học
                    <ArrowUpRight size={16} />
                  </Link>
                  <Link to="/favorites">
                    <Heart size={18} />
                    Gia sư đã lưu
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
              </div>
            )}
          </WorkspacePanel>
        </WorkspacePanels>
      </div>
      <div className="workspace-lower">
        <WeekAgenda bookings={rows} tutor={isTutor} />
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

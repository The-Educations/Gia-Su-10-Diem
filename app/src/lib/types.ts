export type ProfileSection = { title: string; body: string };
export type EducationEntry = {
  level: "high_school" | "college" | "university" | "postgraduate" | "other";
  institution: string;
  field: string;
  start_year: number;
  end_year: number | null;
};
export type GalleryPhoto = { id: string; url: string; caption: string; created_at: string };
export type User = {
  id: number;
  name: string;
  email: string;
  timezone: string;
  email_verified: boolean;
  email_verification_required: boolean;
  role: "student" | "tutor" | "admin";
  learner_type: "student" | "parent";
  goal: string;
  demo: boolean;
  onboarding_step: number;
};
export type Subject = {
  id: string;
  name: string;
  stage: string;
  description: string;
};
export type WeeklySchedule = { blocks: { weekday: number; hour: number }[]; revision: number };
export type Slot = {
  duration_minutes: number;
  source: "manual" | "weekly";
  id: number;
  tutor_id: number;
  starts_at: string;
  reserved?: number;
};
export type Tutor = {
  weekly_schedule: WeeklySchedule;
  gallery: GalleryPhoto[];
  photo_url: string | null;
  banner_url: string | null;
  user_id: number;
  name: string;
  demo: number;
  headline: string;
  teaching_style: string;
  lesson_plan: string;
  profile_theme: "paper" | "sage" | "ink";
  timezone: string;
  education_history: EducationEntry[];
  profile_sections: ProfileSection[];
  bio: string;
  location: string;
  mode: string;
  rate: number;
  experience: number;
  education: string;
  subjects: string[];
  levels: string[];
  goals: string[];
  status: string;
  moderation_note: string;
  rating: number;
  review_count: number;
  slots: Slot[];
  reviews: { name: string; rating: number; body: string }[];
};
export type Booking = {
  duration_minutes: number;
  id: number;
  student_id: number;
  tutor_id: number;
  student_name: string;
  tutor_name: string;
  subject_name: string;
  starts_at: string;
  rate: number;
  mode: string;
  note: string;
  status: string;
  lesson_note: string;
  meeting_url: string;
  reviewed: number | null;
};
export type Resource = {
  id: number;
  title: string;
  subject_id: string;
  subject_name: string;
  category: string;
  level: string;
  year: number;
  description: string;
  source_name: string;
  source_url: string;
  published: number | boolean;
};
export type Message = {
  id: number;
  booking_id: number;
  sender_id: number;
  name: string;
  body: string;
  created_at: string;
};
export type AdminData = {
  users: (User & { status: string; created_at: string })[];
  tutors: Tutor[];
  resources: Resource[];
  audit: {
    id: number;
    name: string;
    action: string;
    target: string;
    created_at: string;
  }[];
};

export type Inquiry = {
  id: number;
  student_id: number;
  tutor_id: number;
  student_name: string;
  tutor_name: string;
  created_at: string;
  last_message: string;
};

export const accountRole = (user: User) => user.role === "admin" ? "Quản trị viên" : user.role === "tutor" ? "Gia sư" : user.learner_type === "parent" ? "Phụ huynh" : "Học sinh";

export type Post = { id: number; title: string; summary: string; body: string; published: number; published_at: string | null };

export type User = {
  id: number;
  name: string;
  email: string;
  role: "student" | "tutor" | "admin";
  goal: string;
  demo: boolean;
};
export type Subject = {
  id: string;
  name: string;
  stage: string;
  description: string;
};
export type Slot = {
  id: number;
  tutor_id: number;
  starts_at: string;
  reserved?: number;
};
export type Tutor = {
  photo_url: string | null;
  cv: { name: string; size: number; url: string; uploaded_at: string } | null;
  user_id: number;
  name: string;
  demo: number;
  headline: string;
  teaching_style: string;
  lesson_plan: string;
  profile_theme: "paper" | "sage" | "ink";
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

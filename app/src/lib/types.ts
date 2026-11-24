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
  profile_code: string;
  display_name: string;
  community_locked: boolean;
  community_lock_reason: string;
  id: number;
  name: string;
  email: string;
  timezone: string;
  email_verified: boolean;
  email_verification_required: boolean;
  role: "student" | "tutor" | "admin";
  learner_type: "student" | "parent";
  goal: string;
  school: string;
  province_code: string;
  ward_code: string;
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
  available?: number;
};
export type ProfileTheme = { id: "paper" | "sage" | "ink"; name: string };
export type PublishedProfile = Pick<
  Tutor,
  "headline" | "bio" | "education" | "experience" | "education_history" | "profile_sections" | "teaching_style" | "lesson_plan" | "subjects" | "levels" | "goals"
>;
export type TutorKind = "" | "student" | "teacher" | "professional";
export type VerifiedCredential = { kind: CredentialKind; label: string };
export type CredentialKind = "school" | "award" | "certificate";
export type CredentialDetail = {
  field: string;
  start_year: number | null;
  end_year: number | null;
  current: boolean;
  prize: string;
  subject: string;
  score: string;
  reference: string;
};
export type Credential = {
  id: number;
  kind: CredentialKind;
  catalog_id: string;
  name: string;
  detail: CredentialDetail;
  label: string;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  files: { id: string; mime: string; name: string; size: number; url: string }[];
};
export type Tutor = {
  email?: string;
  tutor_kind: TutorKind;
  intro_video: string;
  sample_video?: string;
  verified?: VerifiedCredential[];
  // Last approved content while an edited version awaits review.
  published?: PublishedProfile | null;
  theme_inventory: ProfileTheme[];
  weekly_blocks: WeeklySchedule["blocks"];
  review_revision: number;
  weekly_schedule: WeeklySchedule;
  gallery: GalleryPhoto[];
  photo_url: string | null;
  banner_url: string | null;
  user_id: number;
  name: string;
  demo: number;
  headline: string;
  accepts_trial: number | boolean;
  teaching_style: string;
  lesson_plan: string;
  profile_theme: "paper" | "sage" | "ink";
  timezone: string;
  education_history: EducationEntry[];
  profile_sections: ProfileSection[];
  bio: string;
  location: string;
  area_lat?: number | null;
  area_lng?: number | null;
  area_km?: number | null;
  province_code: string;
  ward_code: string;
  mode: string;
  rate: number;
  experience: number;
  education: string;
  subjects: string[];
  levels: string[];
  goals: string[];
  status: string;
  moderation_note: string;
  review_count: number;
  trust: Trust;
  slots: Slot[];
  reviews: { author: string; rating: number; body: string; created_at: string; lessons: number }[];
};
export type Trust = {
  score: number | null;
  is_new: boolean;
  sort_score: number;
  review_count: number;
  punctuality: number | null;
  tags: { code: string; label: string; count: number }[];
};
export type Booking = {
  offer_id?: number | null;
  inquiry_id?: number | null;
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
  started_at?: string | null;
  reviewed: number | null;
  review_body?: string | null;
  review_hidden?: number | null;
  review_reply?: string | null;
  my_rating?: number | null;
  my_tags?: string[];
  rating_open_until?: string | null;
  rating_edit_until?: string | null;
  rating_editable?: boolean;
  last_message?: string | null;
  last_message_at?: string | null;
  last_sender?: string | null;
  last_is_event?: number | null;
  unread_count?: number;
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
export type MessageContext = {
  kind: "offer" | "lesson" | "weekly-request" | "proposal";
  id: number;
  subject_name: string;
  status: string;
  start_date?: string;
  end_date?: string;
  starts_at?: string;
  duration_minutes?: number;
  sessions?: number;
  minutes?: number;
  blocks?: WeeklySchedule["blocks"];
};
export type ChatAttachment = { id: string; kind: "image" | "audio" | "file"; name?: string; size: number; url: string };
export type Message = {
  attachment?: ChatAttachment | null;
  id: number;
  booking_id: number;
  sender_id: number;
  name: string;
  body: string;
  created_at: string;
  context?: MessageContext | null;
  context_kind?: MessageContext["kind"] | null;
  is_event?: number;
  event_href?: string | null;
  masked?: number;
};
export type AdminData = {
  theme_catalog: ProfileTheme[];
  users: (User & { status: string; created_at: string })[];
  tutors: Tutor[];
  resources: Resource[];
  audit: {
    id: number;
    name: string;
    action: string;
    target: string;
    created_at: string;
    credential_tutor: number | null;
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
  last_message_at?: string | null;
  last_sender?: string | null;
  last_is_event?: number | null;
  unread_count?: number;
};

export const accountRole = (user: User) => user.role === "admin" ? "Quản trị viên" : user.role === "tutor" ? "Gia sư" : user.learner_type === "parent" ? "Phụ huynh" : "Học sinh";

export type Post = { id: number; title: string; summary: string; body: string; published: number; published_at: string | null };

export type NewsTopic = "admissions" | "policy" | "study";
export type NewsCard = {
  id: number; slug: string; title: string; summary: string; topic: NewsTopic;
  cover_url: string; cover_alt: string; published_at: string | null; revised_at: string | null; reading_minutes: number;
};
export type NewsCta = { heading: string; text: string; button: string; href: string };
// What NewsArticle renders. The public detail adds cta/related; the admin preview builds it from the form.
export type NewsArticleData = NewsCard & {
  cover_credit: string; body: string; body_html: string; source_name: string; source_url: string;
  cta?: NewsCta | null; related?: NewsCard[];
};
export type NewsDetail = NewsArticleData & { updated_at: string; cta: NewsCta; related: NewsCard[] };
export type NewsList = { pinned: NewsCard | null; items: NewsCard[]; has_more: boolean };
export type NewsTab = "review" | "drafts" | "published";
export type AdminNewsRow = {
  id: number; slug: string; title: string; summary: string; topic: NewsTopic; origin: "auto" | "manual";
  published: number; pinned: number; cover_url: string; cover_alt: string; source_name: string; source_url: string;
  created_at: string; updated_at: string; published_at: string | null; revised_at: string | null; warnings: string[];
};
export type AdminNewsList = { counts: Record<NewsTab, number>; items: AdminNewsRow[] };
export type AdminNewsPost = Omit<AdminNewsRow, "warnings"> & {
  body: string; body_html: string; cover_credit: string; cta_level: string; cta_goal: string; reading_minutes: number;
};

export type CommunityAuthor = { profile_code: string; has_avatar: boolean; image_version: string; label: string; name_part: string; tier: "student" | "parent" | "tutor" | "admin"; tutor_id?: number };
export interface CommunityDraft {
  id: string;
  title: string;
  body: string;
  body_html: string;
  version: number;
  updated_at: string;
}
export type CommunityPostData = {
  id: number; public: boolean; kind: "user" | "announcement" | "rules"; title: string; body: string; body_html?: string;
  author: CommunityAuthor; mine: boolean; solved: boolean; best_comment_id: number | null;
  published_at: string | null; created_at: string; updated_at: string;
  comment_count: number; helpful_count: number; following: boolean;
  status?: "pending" | "approved" | "rejected" | "hidden" | "deleted";
  review_note?: string; revision_title?: string | null; revision_body?: string | null; revision_body_html?: string;
  revision_status?: "pending" | "rejected" | null; revision_note?: string;
};
export type CommunityComment = {
  id: number; post_id: number; parent_id: number | null; body: string; author: CommunityAuthor | null;
  removed: boolean; removed_by_admin: boolean; mine: boolean; edited: boolean; created_at: string;
  helpful_count: number; helpful_by_me: boolean; replies?: CommunityComment[];
};
export type CommunityRequest = { id: number; title: string; summary: string; subject: string | null; level: string | null; published_at: string; author: CommunityAuthor };
export type CommunityRequests = { items: CommunityRequest[] };
export type CommunityIdentity = { author: CommunityAuthor; needs_name: boolean };
export type CommunitySummary = { pending: number; approved: number; hidden: number; reports: number };
export type CommunityFeed = { rules: CommunityPostData | null; items: CommunityPostData[]; more: boolean };
export type CommunityNotice = { detail: string; id: number; kind: string; post_id: number; title: string; created_at: string; read_at: string | null };
export type CommunityOwner = { id: number; name: string; email: string; community_locked: boolean | number; community_lock_reason: string };
export type CommunityReview = CommunityPostData & {
  owner: CommunityOwner;
  review_version: number;
  days_left?: number;
  // The moderation bot's reason for sending the post to an admin; valid only while ai_version equals review_version.
  ai_verdict?: string | null;
  ai_reason?: string;
  ai_version?: number | null;
  // Only in the "Bị từ chối" list.
  is_revision?: boolean;
  reason?: string;
  reviewer?: { id: number; name: string } | null;
  reviewed_at?: string | null;
};

export type CommunityMember = CommunityAuthor & {
  code: string; has_cover: boolean; bio: string; joined_at: string; mine: boolean; display_name?: string;
  stats: { posts: number; comments: number; helpful: number };
};
export type CommunityMemberResponse = { profile: CommunityMember; admin?: CommunityOwner & { status: string } };

export type WalletEntry = { id: number; kind: string; amount: number; held: number; credits: number; ref: string; note: string; created_at: string };
export type Wallet = {
  available: number;
  held: number;
  credits_free: number;
  credits_paid: number;
  entries: WalletEntry[];
  withdrawals: { id: number; amount: number; bank_name: string; account_number: string; account_name: string; account_last4: string; status: string; note: string; created_at: string; handled_at: string | null; code: string | null; bank_confirmed: number; receipt_url: string | null }[];
  settings: { offer_credits: number; credit_packs: { credits: number; price: number }[]; min_deposit: number; fee_percent: number };
  payments: "live" | "simulated" | "off";
};
export type Deposit = { id: number; code: string; amount: number; received: number; status: string; created_at: string; qr_url: string | null; pay_url?: string | null; account: string; bank: string; holder: string; simulated?: boolean; checkout?: { action: string; fields: Record<string, string> } | null };
export type Proposal = {
  id: number;
  sender: "student" | "tutor";
  student_id: number;
  tutor_id: number;
  student_name: string;
  tutor_name: string;
  subject_id: string;
  subject_name: string;
  level: string;
  mode: "online" | "offline";
  area: string;
  sessions: number;
  minutes: number;
  rate: number;
  total: number;
  payout: number;
  fee_percent: number;
  schedule: { weekday: number; hour: number; minute: number }[];
  start_date: string;
  message: string;
  status: "pending" | "accepted" | "declined" | "expired" | "withdrawn";
  expires_at: string;
  created_at: string;
  incoming: boolean;
};

export type ClassSession = {
  id: number; class_id: number; starts_at: string; minutes: number; status: string; moved_from: string | null;
  title: string; color: string; tutor_id: number; subject_id: string; mode: string; meeting_url: string;
  member_id: number | null; tutor_confirmed_at: string | null; student_confirmed_at: string | null;
  outcome: "pending" | "confirmed" | "charged" | "refunded" | "disputed" | null; rating: number | null; survey?: string; comment?: string;
  student_id: number | null; student_name: string | null; tutor_name: string;
};
export type ClassMember = {
  id: number; class_id: number; student_id: number; name: string; sessions_total: number; rate: number; held: number;
  status: string; done: number; remaining: number; published_rating: number | null; review: string; reminded_at: string | null;
};
export type ClassInfo = {
  id: number; tutor_id: number; tutor_name: string; title: string; subject_id: string; subject_name: string; mode: string; area: string;
  color: string; minutes: number; schedule: { weekday: number; hour: number; minute: number }[]; meeting_url: string; status: string;
  members: ClassMember[]; next_at?: string | null;
  sessions?: ClassSession[];
  materials?: { id: number; session_id: number | null; title: string; url: string; note: string; created_at: string }[];
  moves?: { id: number; session_id: number; requested_by: number; starts_at: string }[];
};

export type CalendarEvent = { id: number; title: string; starts_at: string; ends_at: string; color: string; note: string };

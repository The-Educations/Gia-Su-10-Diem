import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  Heart,
  House,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  Search,
  ShieldCheck,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react";
import type { User } from "./types";

export type NavItem = { to: string; label: string; icon: LucideIcon; short?: string };
export type NavModel = {
  home: string;
  primary: NavItem[];
  groups: { label: string; items: NavItem[] }[];
  // The phone's bottom bar: four destinations, the rest live behind "Thêm".
  bar: NavItem[];
};

const item = (to: string, label: string, icon: LucideIcon, short?: string): NavItem => ({ to, label, icon, short });
const find = item("/tutors", "Tìm gia sư", Search);
const subjects = item("/library", "Tìm môn học", BookOpen, "Môn học");
const community = item("/community", "Cộng đồng", MessagesSquare);
const news = item("/news", "Tin tức", Newspaper);
const messages = item("/messages", "Tin nhắn", MessageCircle);
const offers = item("/offers", "Đề nghị học", BookOpen, "Đề nghị");

export function navigationFor(user: User | null): NavModel {
  if (!user)
    return {
      home: "/tutors",
      primary: [find, subjects, community, news],
      groups: [],
      bar: [find, subjects, community, news],
    };
  if (user.role === "admin") {
    const admin = item("/admin", "Quản trị", ShieldCheck),
      lessons = item("/calendar", "Lịch dạy", CalendarDays);
    return {
      home: "/admin",
      primary: [admin, lessons, messages],
      groups: [{ label: "Khám phá", items: [find, subjects, community, news] }],
      bar: [admin, lessons, messages, community],
    };
  }
  const overview = item("/workspace", "Tổng quan", House);
  if (user.role === "tutor") {
    const lessons = item("/bookings", "Lịch dạy của tôi", CalendarDays, "Lịch dạy");
    return {
      home: "/workspace",
      primary: [overview, lessons, offers, messages, community],
      groups: [
        {
          label: "Hồ sơ",
          items: [
            item("/studio", "Hồ sơ gia sư", UserRoundPen),
            item("/calendar", "Giờ trống hằng tuần", CalendarClock),
          ],
        },
        { label: "Khám phá", items: [find, subjects, news] },
      ],
      bar: [overview, lessons, offers, messages],
    };
  }
  const lessons = item(
    "/bookings",
    user.learner_type === "parent" ? "Lịch học của con" : "Lịch học của tôi",
    CalendarDays,
    "Lịch học",
  );
  return {
    home: "/workspace",
    primary: [overview, find, lessons, offers, messages],
    groups: [
      {
        label: "Của tôi",
        items: [
          item("/availability", "Lịch rảnh", CalendarClock),
          item("/favorites", "Gia sư đã lưu", Heart),
        ],
      },
      { label: "Khám phá", items: [subjects, community, news] },
    ],
    bar: [overview, find, lessons, messages],
  };
}

export const allItems = (model: NavModel) => [
  ...model.primary,
  ...model.groups.flatMap((g) => g.items),
];

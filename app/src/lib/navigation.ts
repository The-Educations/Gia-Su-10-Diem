import {
  CalendarCheck,
  CalendarDays,
  Heart,
  House,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  Search,
  ShieldCheck,
  UserRoundPen,
  Send,
  Wallet,
  GraduationCap,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { User } from "./types";

export type NavItem = { to: string; label: string; icon: LucideIcon; short?: string; badge?: string };
export type NavModel = {
  home: string;
  primary: NavItem[];
  groups: { label: string; items: NavItem[] }[];
  // The phone's bottom bar: four destinations, the rest live behind "Thêm".
  bar: NavItem[];
};

const item = (to: string, label: string, icon: LucideIcon, short?: string): NavItem => ({ to, label, icon, short });
const find = item("/tutors", "Tìm gia sư", Search);
const community = item("/community", "Cộng đồng", MessagesSquare);
const news = item("/news", "Tin tức", Newspaper);
const messages = item("/messages", "Tin nhắn", MessageCircle);
const offers = item("/proposals", "Đề nghị", Send);
const wallet = item("/wallet", "Số dư", Wallet);
const classes = item("/classes", "Lớp học", GraduationCap, "Lớp");
const schedule = item("/schedule", "Lịch", CalendarDays);

export function navigationFor(user: User | null): NavModel {
  if (!user) return { home: "/tutors", primary: [find, community, news], groups: [], bar: [find, community, news] };
  if (user.role === "admin") {
    const admin = item("/admin", "Quản trị", ShieldCheck), sessions = { ...item("/sessions", "Buổi học", CalendarCheck), badge: "sessions" };
    return {
      home: "/admin",
      primary: [admin, sessions, schedule, messages],
      groups: [{ label: "Khám phá", items: [find, community, news] }],
      bar: [admin, sessions, schedule, messages, community],
    };
  }
  const overview = item("/workspace", "Tổng quan", House);
  if (user.role === "tutor")
    return {
      home: "/workspace",
      primary: [overview, schedule, classes, offers, messages, community, news],
      groups: [{ label: "Hồ sơ", items: [wallet, item("/studio", "Hồ sơ gia sư", UserRoundPen), find] }],
      bar: [overview, schedule, classes, offers],
    };
  if (user.learner_type === "parent") {
    const family = item("/family", "Con của tôi", UsersRound, "Con");
    return {
      home: "/workspace",
      primary: [overview, family, classes, schedule, find, messages],
      groups: [{ label: "Của tôi", items: [wallet, community, news] }],
      bar: [overview, family, classes, schedule, find],
    };
  }
  return {
    home: "/workspace",
    primary: [overview, find, schedule, classes, offers, messages],
    groups: [{ label: "Của tôi", items: [wallet, item("/favorites", "Gia sư đã lưu", Heart), community, news] }],
    bar: [overview, find, schedule, classes],
  };
}

export const allItems = (model: NavModel) => [
  ...model.primary,
  ...model.groups.flatMap((g) => g.items),
];

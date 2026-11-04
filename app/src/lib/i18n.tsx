import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "vi" | "en";
const STORAGE_KEY = "giasu.lang";

// Vietnamese is the source language. Each key is the Vietnamese text used in
// the interface and the value is its English version. A string without an
// entry stays Vietnamese, so pages can be translated one at a time.
const en: Record<string, string> = {
  // Navigation
  "Quản trị": "Admin",
  "Tổng quan": "Overview",
  "Lịch dạy": "Schedule",
  "Lịch dạy của tôi": "My schedule",
  "Lịch học của con": "Child's lessons",
  "Lịch học của tôi": "My lessons",
  "Tin nhắn": "Messages",
  "Đề nghị học": "Lesson requests",
  "Giờ trống hằng tuần": "Weekly hours",
  "Hồ sơ gia sư": "Tutor profile",
  "Lịch rảnh": "My availability",
  "Gia sư đã lưu": "Saved tutors",
  "Tìm gia sư": "Find tutors",
  "Tìm môn học": "Find subjects",
  "Cộng đồng": "Community",
  "Tin tức": "News",
  // Shell
  "Thanh điều hướng": "Navigation bar",
  "Điều hướng chính": "Main navigation",
  "Điều hướng": "Navigation",
  "Mở điều hướng": "Open navigation",
  "Thu gọn": "Collapse",
  "Thu gọn thanh điều hướng": "Collapse navigation",
  "Mở rộng thanh điều hướng": "Expand navigation",
  "Về trang giới thiệu": "Homepage",
  "Đăng xuất": "Log out",
  "Đã đăng xuất": "Logged out",
  "Tài khoản": "Account",
  "Đến nội dung": "Skip to content",
  "Tài khoản mẫu": "Demo account",
  "Không tìm thấy trang": "Page not found",
  "Về tìm gia sư": "Back to find tutors",
  "Quyền riêng tư": "Privacy",
  "Điều khoản dịch vụ": "Terms of service",
  "Thông tin pháp lý": "Legal information",
  // Account menu and roles
  "Xem hồ sơ của tôi": "View my profile",
  "Cài đặt tài khoản": "Account settings",
  "Quản trị viên": "Administrator",
  "Gia sư": "Tutor",
  "Phụ huynh": "Parent",
  "Học sinh": "Student",
  // Language switch
  "Ngôn ngữ": "Language",
  "Tiếng Việt": "Vietnamese",
  "Tiếng Anh": "English",
};

type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: (vi: string) => string };

const I18nContext = createContext<I18n>({ lang: "vi", setLang: () => {}, t: (vi) => vi });

function storedLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* The choice still applies to this visit when storage is unavailable. */
    }
  }, []);
  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (vi) => (lang === "en" ? en[vi] ?? vi : vi) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

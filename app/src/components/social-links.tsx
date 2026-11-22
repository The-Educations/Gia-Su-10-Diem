import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n";

// Official pages of Gia Sư 10 Điểm. Tracking parameters are left out on purpose.
export const SOCIAL_LINKS: { name: string; href: string; icon: ReactNode }[] = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61596469006930",
    icon: (
      <path d="M13.5 21v-7.5h2.6l.4-3.1h-3V8.5c0-.9.3-1.5 1.6-1.5h1.6V4.2c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.3H8v3.1h2.5V21h3Z" />
    ),
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/giasu_10diem/",
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16.9" cy="7.1" r="1.1" />
      </>
    ),
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@giasu_10diem",
    icon: (
      <path d="M16.6 3h-2.9v11.6a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.1a5.5 5.5 0 1 0 4.7 5.4V9.1a6.6 6.6 0 0 0 3.8 1.2V7.4a3.9 3.9 0 0 1-3.8-4.4Z" />
    ),
  },
];

export function SocialLinks() {
  const { t } = useI18n();
  return (
    <nav className="social-links" aria-label={t("Mạng xã hội")}>
      {SOCIAL_LINKS.map((link) => (
        <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.name} title={link.name}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
            {link.icon}
          </svg>
        </a>
      ))}
    </nav>
  );
}

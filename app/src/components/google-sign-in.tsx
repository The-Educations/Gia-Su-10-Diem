import { ErrorState } from "./common";
import { Button } from "./ui/button";
import { useLoad } from "@/lib/api";
export const googleErrors: Record<string, string> = {
  unavailable:
    "Đăng nhập Google tạm thời không khả dụng. Bạn có thể dùng email và mật khẩu.",
  rate_limited: "Vui lòng chờ một phút trước khi yêu cầu mã mới.",
  mail_unavailable: "Chưa gửi được mã xác minh. Vui lòng thử lại sau.",
  expired: "Phiên đăng nhập đã hết hạn. Vui lòng thử lại.",
  cancelled: "Bạn đã hủy đăng nhập Google.",
  failed: "Không thể xác thực Google. Vui lòng thử lại.",
  suspended: "Tài khoản đã bị tạm khóa.",
  email_exists:
    "Email này đã có tài khoản. Đăng nhập bằng mật khẩu, rồi liên kết Google trong Tài khoản của tôi.",
  link_failed:
    "Không thể liên kết. Đăng nhập lại tài khoản của bạn và thử lại.",
};
export function GoogleSignIn({
  next,
  disabled = false,
}: {
  next?: string | null;
  disabled?: boolean;
}) {
  const providers = useLoad<{ google: boolean }>("/auth/providers");
  if (providers.error)
    return (
      <ErrorState
        error="Không tải được đăng nhập Google."
        retry={providers.reload}
      />
    );
  if (!providers.data?.google)
    return (
      <div className="google-sign-in">
        <Button
          variant="outline"
          className="w-full"
          disabled
          aria-busy={providers.loading}
        >
          {providers.loading
            ? "Đang tải đăng nhập Google…"
            : "Google tạm thời không khả dụng"}
        </Button>
      </div>
    );
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  return (
    <div className="google-sign-in">
      <Button asChild variant="outline" className="w-full aria-disabled:opacity-50">
        <a role="link" aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} href={disabled ? undefined : `/api/auth/google/start${params.size ? `?${params}` : ""}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.61 0-4.82-1.76-5.61-4.12H3.04v2.59A10 10 0 0 0 12 22Z"
            />
            <path
              fill="#FBBC05"
              d="M6.39 13.92a6 6 0 0 1 0-3.84V7.49H3.04a10 10 0 0 0 0 9.02l3.35-2.59Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.96c1.47 0 2.79.51 3.83 1.51L18.7 4.6A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.49l3.35 2.59A5.99 5.99 0 0 1 12 5.96Z"
            />
          </svg>
          Tiếp tục với Google
        </a>
      </Button>
    </div>
  );
}

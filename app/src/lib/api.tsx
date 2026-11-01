import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "./types";
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Không thể kết nối. Vui lòng thử lại.");
  return data;
}
const Context = createContext<{
  user: User | null;
  loading: boolean;
  authError: string;
  retryAuth: () => void;
  revision: number;
  refresh: () => void;
  setUser: (u: User | null) => void;
}>({
  user: null,
  loading: true,
  authError: "",
  retryAuth: () => {},
  revision: 0,
  refresh: () => {},
  setUser: () => {},
});
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [authError, setAuthError] = useState(""),
    [authAttempt, setAuthAttempt] = useState(0);
  const setUser = useCallback((value: User | null) => {
    setUserState(value);
    setAuthError("");
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setAuthError("");
    api<{ user: User | null }>("/auth/me")
      .then((d) => {
        if (active) setUser(d.user);
      })
      .catch(() => {
        if (active)
          setAuthError("Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authAttempt, setUser]);
  const retryAuth = useCallback(() => setAuthAttempt((n) => n + 1), []);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  return (
    <Context.Provider
      value={{
        user,
        loading,
        authError,
        retryAuth,
        revision,
        refresh,
        setUser,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
export function useLoad<T>(path: string | null) {
  const { revision, user } = useApp();
  const key = `${user?.id || "guest"}:${path || ""}`;
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string;
    pending: boolean;
  }>({ key: "", data: null, error: "", pending: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState((previous) => ({
      key,
      data: previous.key === key ? previous.data : null,
      error: "",
      pending: !!path,
    }));
    if (path)
      api<T>(path)
        .then((data) => {
          if (active) setState({ key, data, error: "", pending: false });
        })
        .catch((e) => {
          if (active)
            setState((previous) => ({
              ...previous,
              key,
              error: e.message,
              pending: false,
            }));
        });
    return () => {
      active = false;
    };
  }, [path, key, revision, retry]);
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : "",
    loading: !!path && (!current || (state.pending && !state.data)),
    refreshing: current && state.pending,
    reload: () => setRetry((r) => r + 1),
  };
}
export const money = (n: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
export const dateTime = (s: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z"));
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
export const statusNames: Record<string, string> = {
  pending: "Chờ xác nhận",
  pending_profile: "Chờ duyệt",
  accepted: "Đã xác nhận",
  declined: "Đã từ chối",
  cancelled: "Đã hủy",
  completed: "Đã hoàn thành",
  approved: "Đã công bố",
  rejected: "Cần bổ sung",
  active: "Hoạt động",
  suspended: "Tạm khóa",
};

export function accountDestination(user: User, next?: string | null) {
  const safe = next && /^\/(?!\/)/.test(next) && !/[\\\x00-\x20]/.test(next)
    && !/^\/(auth|onboarding)([/?#]|$)/.test(next) ? next : "";
  if (user.role !== "admin" && user.onboarding_step < 3)
    return `/onboarding${safe ? `?next=${encodeURIComponent(safe)}` : ""}`;
  return safe || (user.role === "tutor" ? "/studio" : user.role === "admin" ? "/admin" : "/workspace");
}

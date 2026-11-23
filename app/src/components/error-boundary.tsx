import { useI18n } from "@/lib/i18n";
function BoundaryFallback() {
  const { t } = useI18n();
  return (
    <div className="page" role="alert">
      <h1>{t("Không thể hiển thị trang")}</h1>
      <div className="actions">
        <Button onClick={() => window.location.reload()}>{t("Tải lại trang")}</Button>
        <Button variant="outline" asChild><a href="/app/tutors">{t("Về tìm gia sư")}</a></Button>
      </div>
    </div>
  );
}

import { Component, type ReactNode } from "react";
import { Button } from "./ui/button";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <BoundaryFallback />;
    return this.props.children;
  }
}

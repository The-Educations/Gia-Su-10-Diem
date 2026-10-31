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
    if (this.state.failed) {
      return (
        <div className="page" role="alert">
          <h1>Không thể hiển thị trang</h1>
          <div className="actions">
            <Button onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>
            <Button variant="outline" asChild>
              <a href="/app/tutors">Về tìm gia sư</a>
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

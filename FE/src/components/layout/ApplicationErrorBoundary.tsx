import { Component, type ReactNode } from 'react';

/** Keep an unexpected rendering failure recoverable instead of showing a blank page. */
export class ApplicationErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="customer-shell-loading"><section className="auth-panel" role="alert">
      <p className="eyebrow">NestBox Storage</p>
      <h1>Chưa thể hiển thị trang này</h1>
      <p>Bạn có thể tải lại trang hoặc trở về khu vực tài khoản. Nếu vừa gửi yêu cầu, hãy kiểm tra danh sách hồ sơ trước khi gửi lại.</p>
      <div className="portal-actions"><button className="button-primary" type="button" onClick={() => window.location.reload()}>Tải lại trang</button><a className="button-secondary" href="/account/login">Về khu vực tài khoản</a></div>
    </section></main>;
  }
}

import { ArrowRight, LockKeyhole } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { roleReturnPath } from "../../auth/portal-routing";
import { Container } from "../../components/ui/Container";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, loading, login, register } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState(() =>
    sessionStorage.getItem("wdp-session-expired")
      ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục."
      : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const returnTo = roleReturnPath("CUSTOMER", params.get("returnTo"));
  if (loading)
    return (
      <main className="customer-shell-loading" role="status">
        Đang kiểm tra phiên đăng nhập…
      </main>
    );
  if (user)
    return (
      <Navigate
        to={roleReturnPath(user.role, params.get("returnTo"))}
        replace
      />
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (mode === "register") {
        await register({
          fullName: String(data.get("fullName")),
          phone: String(data.get("phone")),
          email: String(data.get("email")).trim().toLowerCase(),
          password: String(data.get("password")),
        });
      } else {
        await login({
          email: String(data.get("email")).trim().toLowerCase(),
          password: String(data.get("password")),
        });
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể xác thực tài khoản.",
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const otherPath = mode === "login" ? "/account/register" : "/account/login";
  return (
    <section className="auth-page">
      <Container className="max-w-lg">
        <form className="auth-panel" onSubmit={submit}>
          <span className="auth-icon">
            <LockKeyhole size={24} />
          </span>
          <p className="eyebrow">
            {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </p>
          <h1>
            {mode === "login"
              ? "Đăng nhập tài khoản"
              : "Tạo tài khoản khách hàng"}
          </h1>
          <p>
            {returnTo.startsWith("/booking")
              ? "Thông tin đặt kho được giữ trên trình duyệt để bạn tiếp tục."
              : "Đăng nhập để theo dõi kho thuê và các yêu cầu của bạn."}
          </p>
          {error && (
            <div className="booking-alert is-error" role="alert">
              {error}
            </div>
          )}
          <div className="mt-7 grid gap-5">
            {mode === "register" && (
              <>
                <label className="field-label">
                  Họ và tên
                  <input
                    name="fullName"
                    autoComplete="name"
                    minLength={2}
                    required
                  />
                </label>
                <label className="field-label">
                  Số điện thoại
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    minLength={8}
                    required
                  />
                </label>
              </>
            )}
            <label className="field-label">
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label className="field-label">
              Mật khẩu
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "register" ? 8 : 1}
                maxLength={128}
                aria-describedby="auth-password-help"
                required
              />
            </label>
            <small id="auth-password-help">{mode === "register" ? "Tối thiểu 8 ký tự." : "Nhập mật khẩu tài khoản của bạn."}</small>
          </div>
          <button
            className="button-primary mt-7 w-full justify-center"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Đang xử lý..."
              : mode === "login"
                ? "Đăng nhập"
                : "Tạo tài khoản"}{" "}
            <ArrowRight size={18} />
          </button>
          <p className="auth-switch">
            {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
            <Link to={`${otherPath}?returnTo=${encodeURIComponent(returnTo)}`}>
              {mode === "login" ? "Đăng ký" : "Đăng nhập"}
            </Link>
          </p>
          <p className="auth-disclosure">
            Tài khoản được lưu trong hệ thống; phiên đăng nhập hiện có thể hết
            hạn khi backend khởi động lại.
          </p>
        </form>
      </Container>
    </section>
  );
}

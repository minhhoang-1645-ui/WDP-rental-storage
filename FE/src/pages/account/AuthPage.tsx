import { readSessionEndNotice } from '../../auth/session-end';
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { roleReturnPath } from "../../auth/portal-routing";
import { Container } from "../../components/ui/Container";
import { PasswordInput } from '../../components/ui/PasswordInput';

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, loading, login, register } = useAuth();
  const [params] = useSearchParams();
  const [submitError, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const returnTo = roleReturnPath("CUSTOMER", params.get("returnTo"));
  if (loading)
    return (
      <section className="auth-page" role="status">
        Đang kiểm tra phiên đăng nhập…
      </section>
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
          rememberMe: data.has("rememberMe"),
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

  const error = submitError ?? (mode === 'login' ? readSessionEndNotice() : '');
  const otherPath = mode === "login" ? "/account/register" : "/account/login";
  return (
    <section className="auth-page">
      <Container className="max-w-lg">
        <form className="auth-panel" onSubmit={submit}>
          <span className="auth-icon" aria-hidden="true">
            <LockKeyhole size={24} />
          </span>
          <h1>
            {mode === "login"
              ? "Đăng nhập tài khoản"
              : "Tạo tài khoản khách hàng"}
          </h1>
          {returnTo.startsWith("/booking") && <p>Bạn có thể tiếp tục đặt kho sau khi đăng nhập.</p>}
          {error && (
            <div className="booking-alert is-error" role="alert">
              {error}
            </div>
          )}
          <div className="auth-fields">
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
              <PasswordInput
                name="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "register" ? 8 : 1}
                maxLength={128}
                aria-describedby={mode === "register" ? "auth-password-help" : undefined}
                required
              />
            </label>
            {mode === "register" && <small id="auth-password-help">Mật khẩu tối thiểu 8 ký tự.</small>}
            {mode === "login" && (
              <label className="flex items-center gap-2 text-sm">
                <input name="rememberMe" type="checkbox" className="!size-4 !min-h-0" />
                Duy trì đăng nhập trong 30 ngày
              </label>
            )}
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
          {mode === "login" && <Link className="auth-help-link" to="/forgot-password">Quên mật khẩu</Link>}
        </form>
      </Container>
    </section>
  );
}

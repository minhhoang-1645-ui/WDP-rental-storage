import { readSessionEndNotice } from '../../auth/session-end';
import { LockKeyhole, LogIn } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { roleReturnPath } from "../../auth/portal-routing";
import { PasswordInput } from '../../components/ui/PasswordInput';

export function PortalLoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (user) {
      const returnTo = (location.state as { returnTo?: unknown } | null)
        ?.returnTo;
      navigate(roleReturnPath(user.role, returnTo), { replace: true });
    }
  }, [navigate, user, location.state]);

  if (loading)
    return (
      <section className="auth-page">
        <p>Đang kiểm tra phiên đăng nhập…</p>
      </section>
    );
  if (user)
    return (
      <section className="auth-page">
        <p role="status">Đang mở khu vực làm việc…</p>
      </section>
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      await login({ email: email.trim().toLowerCase(), password });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể đăng nhập.",
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const error = submitError ?? readSessionEndNotice();
  return (
    <section className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <span className="auth-icon" aria-hidden="true">
          <LockKeyhole size={22} />
        </span>
        <h1>Đăng nhập nội bộ</h1>
        {error && (
          <div className="booking-alert is-error" role="alert">
            {error}
          </div>
        )}
        <div className="auth-fields">
          <label className="field-label">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Mật khẩu
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        </div>
        <button
          className="button-primary mt-6 w-full justify-center"
          type="submit"
          disabled={submitting}
        >
          {submitting ? (
            "Đang đăng nhập…"
          ) : (
            <>
              <LogIn size={18} /> Đăng nhập
            </>
          )}
        </button>
        <Link className="auth-help-link" to="/forgot-password?from=portal">Quên mật khẩu</Link>
      </form>
    </section>
  );
}

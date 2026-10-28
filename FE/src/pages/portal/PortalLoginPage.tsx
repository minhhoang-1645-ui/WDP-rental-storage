import { LockKeyhole, LogIn } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { roleReturnPath } from "../../auth/portal-routing";
import { PasswordInput } from '../../components/ui/PasswordInput';

export function PortalLoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() =>
    sessionStorage.getItem("wdp-session-expired")
      ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục."
      : "",
  );
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
      <main className="portal-login">
        <p>Đang kiểm tra phiên đăng nhập…</p>
      </main>
    );
  if (user)
    return (
      <main className="portal-login">
        <p role="status">Đang mở cổng quản lý…</p>
      </main>
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

  return (
    <main className="portal-login">
      <form className="portal-login-panel" onSubmit={submit}>
        <div className="portal-mark">
          <LockKeyhole size={22} />
        </div>
        <p className="eyebrow">NestBox Storage Portal</p>
        <h1>Đăng nhập nội bộ</h1>
        <p>
          Dành cho tài khoản nhân viên, quản lý và quản trị viên đã được cấp
          quyền.
        </p>
        {error && (
          <div className="booking-alert is-error" role="alert">
            {error}
          </div>
        )}
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
        <button
          className="button-primary w-full justify-center"
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
        <small>Không có đăng ký công khai cho tài khoản nội bộ.</small>
      </form>
    </main>
  );
}

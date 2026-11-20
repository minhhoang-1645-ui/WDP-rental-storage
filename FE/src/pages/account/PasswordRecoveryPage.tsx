import { LockKeyhole } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { Container } from '../../components/ui/Container';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { apiRequest, ApiError } from '../../services/api';

const requestRecovery = (action: string, body: object) => apiRequest<{ message: string }>(`/guest/account/${action}`, {
  method: 'POST', authenticated: false, body: JSON.stringify(body),
});

function RecoveryCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="auth-page"><Container className="max-w-lg"><div className="auth-panel">
    <span className="auth-icon" aria-hidden="true"><LockKeyhole size={24} /></span>
    <h1>{title}</h1>
    {children}
  </div></Container></section>;
}

export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const login = params.get('from') === 'portal' ? '/portal/login' : '/account/login';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const locked = useRef(false);
  const cooling = seconds > 0;
  useEffect(() => {
    if (!cooling) return;
    const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooling]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current || cooling) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Nhập email hợp lệ.'); return; }
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await requestRecovery('forgot-password', { email: email.trim() });
      setSent(true);
      setSeconds(60);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa gửi được yêu cầu. Vui lòng thử lại.');
      if (caught instanceof ApiError && caught.status === 429) setSeconds(60);
    } finally { locked.current = false; setBusy(false); }
  }

  return <RecoveryCard title={sent ? 'Kiểm tra email của bạn' : 'Quên mật khẩu?'}>
    {!sent && <p>Nhập email để nhận liên kết đặt lại mật khẩu.</p>}
    <form className="auth-fields" onSubmit={submit} noValidate>
      {!sent && <label className="field-label">Email<input type="email" name="email" autoComplete="email" required maxLength={254}
        value={email} onChange={event => { setEmail(event.target.value); setError(''); }} disabled={busy} aria-describedby={error ? 'recovery-error' : undefined} /></label>}
      {error && <p id="recovery-error" className="booking-alert is-error" role="alert">{error}</p>}
      <button className="button-primary w-full justify-center" disabled={busy || cooling}>
        {busy ? 'Đang gửi…' : sent ? cooling ? `Gửi lại liên kết sau ${seconds}s` : 'Gửi lại liên kết' : 'Gửi liên kết khôi phục'}
      </button>
    </form>
    <Link className="auth-help-link" to={login}>Quay lại đăng nhập</Link>
  </RecoveryCard>;
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const token = new URLSearchParams(hash.slice(1)).get('token') ?? params.get('token') ?? '';
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [error, setError] = useState<{ message: string; field?: 'password' | 'confirm' } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const locked = useRef(false);
  const usable = /^[\w-]{32,200}$/.test(token) && !invalid;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!usable || locked.current) return;
    if (!password.trim() || password.length < 8 || password.length > 128) { setError({ field: 'password', message: 'Mật khẩu phải có 8–128 ký tự.' }); return; }
    if (password !== confirm) { setError({ field: 'confirm', message: 'Mật khẩu xác nhận không khớp.' }); return; }
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await requestRecovery('reset-password', { token, password, confirmPassword: confirm });
      if (auth.user) auth.logout();
      setDone(true);
      setPassword('');
      setConfirm('');
      navigate('/reset-password', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setInvalid(true);
      else if (caught instanceof ApiError && caught.payload && typeof caught.payload === 'object' && 'code' in caught.payload && caught.payload.code === 'PASSWORD_REUSED') {
        setError({ field: 'password', message: 'Mật khẩu mới phải khác mật khẩu đang sử dụng.' });
      } else setError({ message: caught instanceof Error ? caught.message : 'Chưa đặt lại được mật khẩu. Vui lòng thử lại.' });
    } finally { locked.current = false; setBusy(false); }
  }

  return <RecoveryCard title={done ? 'Đặt lại mật khẩu thành công.' : 'Đặt mật khẩu mới'}>
    {done ? <p role="status">Hãy đăng nhập bằng mật khẩu mới để tiếp tục.</p> : !usable ? <>
      <p className="booking-alert is-error" role="alert">Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được dùng.</p>
      <Link className="button-primary mt-4" to="/forgot-password">Yêu cầu liên kết mới</Link>
    </> : <form className="auth-fields" onSubmit={submit} noValidate>
      <div>
        <label className="field-label">Mật khẩu mới<PasswordInput name="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={event => { setPassword(event.target.value); setError(null); }} disabled={busy} aria-invalid={error?.field === 'password' || undefined} aria-describedby={error?.field === 'password' ? 'reset-error' : undefined} /></label>
        {error?.field === 'password' && <p id="reset-error" className="booking-alert is-error" role="alert">{error.message}</p>}
      </div>
      <div>
        <label className="field-label">Xác nhận mật khẩu<PasswordInput name="confirmPassword" autoComplete="new-password" required maxLength={128} value={confirm} onChange={event => { setConfirm(event.target.value); if (error?.field === 'confirm') setError(null); }} disabled={busy} aria-invalid={error?.field === 'confirm' || undefined} aria-describedby={error?.field === 'confirm' ? 'reset-error' : undefined} /></label>
        {error?.field === 'confirm' && <p id="reset-error" className="booking-alert is-error" role="alert">{error.message}</p>}
      </div>
      {error && !error.field && <p className="booking-alert is-error" role="alert">{error.message}</p>}
      <button className="button-primary w-full justify-center" disabled={busy}>{busy ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}</button>
    </form>}
    <Link className="auth-help-link" to="/account/login">Quay lại đăng nhập</Link>
  </RecoveryCard>;
}

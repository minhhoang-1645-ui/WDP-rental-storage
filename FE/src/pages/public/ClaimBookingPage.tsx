import { safeLocalStorage } from '../../services/browser-storage';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { Container } from '../../components/ui/Container';
import { guestBookingApi } from '../../services/guest-booking';
import { apiRequest } from '../../services/api';
import { clearBookingDraft } from '../../data/booking';
import type { AuthSession } from '../../types/booking';

type Context = { email: string; existingAccount: boolean; bookingCode: string; storage: string; startDate: string; endDate: string; quantity: number; quote: { quotedTotalAmount?: number }; status: string };
const key = 'nestbox-booking-onboarding';
const post = <T,>(action: string, body: unknown) => apiRequest<T>('/guest/account/' + action, { method: 'POST', authenticated: false, body: JSON.stringify(body) });
export function ClaimBookingPage() {
  const [params] = useSearchParams();
  const oldResetToken = params.get('resetToken');
  if (oldResetToken) return <Navigate to={{ pathname: '/reset-password', hash: new URLSearchParams({ token: oldResetToken }).toString() }} replace />;
  return <BookingContinuation />;
}

function BookingContinuation() {
  const auth = useAuth(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = useState<{ token: string; bookingCode: string } | null>(() => { try { const value = JSON.parse(safeLocalStorage.getItem(key) ?? 'null'); return value?.bookingCode ? { ...value, token: value.expires > Date.now() ? value.token : '' } : null; } catch { return null; } });
  const [context, setContext] = useState<Context>();
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [email, setEmail] = useState(''), [resendCode, setResendCode] = useState(params.get('bookingCode') ?? '');
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const token = params.get('token') ?? '';
  const code = params.get('bookingCode') || saved?.bookingCode || '';
  const verification = useRef<Promise<{ bookingCode: string; continuationToken: string }> | null>(null), lock = useRef(false);
  const claimed = useRef(''), verifiedToken = useRef('');
  useEffect(() => {
    if (!token) return;
    let active = true;
    if (verifiedToken.current !== token) { verification.current = null; verifiedToken.current = token; }
    verification.current ??= guestBookingApi.verify(token);
    verification.current.then(result => {
      const value = { token: result.continuationToken, bookingCode: result.bookingCode, expires: Date.now() + 30 * 60000 };
      safeLocalStorage.setItem(key, JSON.stringify(value));
      if (active) { setSaved(value); setParams({ bookingCode: result.bookingCode }, { replace: true }); }
    }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Chưa xác minh được email.'); });
    return () => { active = false; };
  }, [token, setParams]);
  useEffect(() => {
    if (!saved?.token || token) return;
    let active = true;
    post<Context>('context', { token: saved.token }).then(value => { if (active) { setContext(value); setEmail(value.email); } }).catch(caught => { if (active) setError(caught.message); });
    return () => { active = false; };
  }, [saved, token, retry]);
  useEffect(() => {
    if (auth.loading || !auth.user || auth.user.role !== 'STORAGE_CUSTOMER' || !code || token || claimed.current === code) return;
    claimed.current = code; setBusy(true);
    guestBookingApi.claim(code).then(value => { safeLocalStorage.removeItem(key); clearBookingDraft(); navigate('/customer/reservations/' + encodeURIComponent(value.reservationCode), { replace: true }); }).catch(caught => setError(caught.message)).finally(() => setBusy(false));
  }, [auth.loading, auth.user, code, token, retry, navigate]);
  const run = async (action: 'continue' | 'resend') => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'continue') {
        if (context?.existingAccount) await auth.login({ email: context.email, password });
        else {
          if (password !== confirm) throw new Error('Mật khẩu xác nhận không khớp.');
          const session = await post<AuthSession>('setup', { token: saved?.token, password, confirmPassword: confirm });
          auth.acceptSession(session);
        }
      } else {
        const result = await post<{ message: string }>('resend', { email: context?.email || email, bookingCode: code || resendCode }); setMessage(result.message);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa thể tiếp tục.'); if (context && action === 'continue') setRetry(value => value + 1); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="public-page-content"><Container className="max-w-3xl"><div className="confirmation-panel">
    <h1>{context ? 'Email đã xác minh thành công' : token ? 'Đang xác minh email…' : 'Tiếp tục yêu cầu đặt kho'}</h1>
    {context && <div className="booking-alert"><div><strong>{context.storage} · {context.quantity} kho</strong><p>{context.startDate} – {context.endDate}</p>{typeof context.quote.quotedTotalAmount === 'number' && <p>Tổng dự kiến: {context.quote.quotedTotalAmount.toLocaleString('vi-VN')} đ</p>}<p>Chưa giữ kho. Giá và khả dụng được kiểm tra lại khi bạn tiếp tục.</p></div></div>}
    {error && <div className="booking-alert is-error" role="alert">{error}<Link className="button-secondary" to="/storage">Xem kho và lựa chọn khác</Link></div>}
    {message && <p role="status">{message}</p>}
    {auth.loading || busy ? <p role="status">Đang xử lý…</p> : auth.user ? <><p>{auth.user.role === 'STORAGE_CUSTOMER' ? 'Tiếp tục bằng tài khoản' : 'Cần dùng tài khoản khách hàng. Bạn đang đăng nhập bằng'} {auth.user.email}.</p>{auth.user.role === 'STORAGE_CUSTOMER' && <button className="button-primary" onClick={() => { claimed.current = ''; setRetry(value => value + 1); }}>Thử nhận lại yêu cầu</button>}<button className="button-secondary" onClick={auth.logout}>Dùng tài khoản khác</button><a className="button-secondary" href={`wdp-storage://continue-booking?bookingCode=${encodeURIComponent(code)}`}>Tiếp tục trên điện thoại</a></> : context ? <form className="portal-form" onSubmit={event => { event.preventDefault(); void run('continue'); }}>
      <h2>{context.existingAccount ? 'Đăng nhập để tiếp tục' : 'Tạo mật khẩu để tiếp tục'}</h2><label className="field-label">Email đã xác minh<input type="email" value={context.email} readOnly autoComplete="username" /></label>
      <label className="field-label">{context.existingAccount ? 'Mật khẩu' : 'Mật khẩu mới'}<input type="password" autoComplete={context.existingAccount ? 'current-password' : 'new-password'} required minLength={context.existingAccount ? 1 : 8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
      {!context.existingAccount && <label className="field-label">Xác nhận mật khẩu<input type="password" required autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} /></label>}
      <button className="button-primary">Tiếp tục đặt kho</button>{context.existingAccount && <Link className="button-secondary" to="/forgot-password">Quên mật khẩu</Link>}
    </form> : !token && <p>Mở liên kết xác minh trong email để tiếp tục. Nếu đã có tài khoản, <Link to={`/account/login?returnTo=${encodeURIComponent('/claim-booking?bookingCode=' + code)}`}>đăng nhập</Link> để nhận yêu cầu đã xác minh.</p>}
    {context && <a className="button-secondary mt-5" href={`wdp-storage://continue-booking?bookingCode=${encodeURIComponent(code)}&continuationToken=${encodeURIComponent(saved?.token ?? '')}`}>Tiếp tục trong ứng dụng NestBox</a>}
    {!auth.user && <details><summary>Gửi lại liên kết xác minh</summary><form className="portal-form" onSubmit={event => { event.preventDefault(); void run('resend'); }}><label className="field-label">Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><label className="field-label">Mã yêu cầu<input value={resendCode} onChange={event => setResendCode(event.target.value)} /></label><button className="button-secondary" disabled={busy}>Gửi lại email xác minh</button></form></details>}
  </div></Container></section>;
}

import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { Container } from '../../components/ui/Container';
import { guestBookingApi } from '../../services/guest-booking';

export function ClaimBookingPage() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const token = params.get('token') ?? '';
  const code = params.get('bookingCode') ?? '';
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reservation, setReservation] = useState('');
  const lock = useRef(false);
  const run = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (token) {
        const record = await guestBookingApi.verify(token);
        setParams({ bookingCode: record.bookingCode }, { replace: true });
      } else if (code && user?.role === 'CUSTOMER') {
        const result = await guestBookingApi.claim(code);
        setReservation(result.reservationCode);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không xử lý được yêu cầu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const destination = `/claim-booking?bookingCode=${encodeURIComponent(code)}`;
  return <section className="section-space"><Container className="max-w-3xl"><div className="confirmation-panel">
    <p className="eyebrow">Yêu cầu đặt kho qua email</p><h1>{reservation ? 'Đã nhận yêu cầu đặt kho' : token ? 'Xác minh email đặt kho' : 'Nhận yêu cầu đã xác minh'}</h1>
    {error && <div className="booking-alert is-error" role="alert">{error}</div>}
    {loading ? <p role="status">Đang kiểm tra phiên…</p> : reservation ? <><p>Mã đặt kho: {reservation}. Thanh toán chưa được thực hiện.</p><Link className="button-primary" to={`/customer/reservations/${encodeURIComponent(reservation)}`}>Xem yêu cầu và thanh toán</Link></> : token ? <><p>Liên kết dùng một lần. Xác minh xong, đăng nhập hoặc đăng ký bằng email đã gửi yêu cầu để nhận kho.</p><button className="button-primary" disabled={busy} onClick={() => void run()}>{busy ? 'Đang xác minh…' : 'Xác minh email'}</button></> : code ? <><p>Mã yêu cầu: {code}. Hệ thống kiểm tra lại báo giá, khả dụng và email tài khoản khi bạn nhận yêu cầu.</p>{user?.role === 'CUSTOMER' ? <button className="button-primary" disabled={busy} onClick={() => void run()}>{busy ? 'Đang xử lý…' : 'Nhận yêu cầu đặt kho'}</button> : !user ? <div className="mt-8 flex flex-wrap gap-3"><Link className="button-primary" to={`/account/login?returnTo=${encodeURIComponent(destination)}`}>Đăng nhập để nhận yêu cầu</Link><Link className="button-secondary" to={`/account/register?returnTo=${encodeURIComponent(destination)}`}>Đăng ký</Link></div> : <p>Chức năng nhận yêu cầu dành cho tài khoản khách hàng.</p>}</> : <p>Vui lòng mở liên kết xác minh trong email của WDP.</p>}
  </div></Container></section>;
}

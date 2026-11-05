import { AtSign, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { roleReturnPath } from '../../auth/portal-routing';
import { PortalPageHeader } from '../../components/customer/CustomerPortalUi';

export function CustomerProfilePage() {
  const { user } = useAuth();
  return <ProfileEditor key={user?.id} />;
}

function ProfileEditor() {
  const { user, updateProfile } = useAuth();
  const [params] = useSearchParams();
  const form = useRef<HTMLFormElement>(null);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const returnTo = params.get('returnTo');
  const destination = returnTo && user ? roleReturnPath(user.role, returnTo) : null;
  const changed = fullName.trim() !== (user?.fullName ?? '') || phone.trim() !== (user?.phone ?? '');
  const edit = () => { setSaved(false); setError(''); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !changed) return;
    const name = fullName.trim(), contact = phone.trim(), digits = contact.replace(/\D/g, '');
    if (name.length < 2 || name.length > 120) { setError('Họ và tên phải có 2–120 ký tự.'); return; }
    if (!/^\+?[\d\s().-]{8,25}$/.test(contact) || digits.length < 8 || digits.length > 15) { setError('Số điện thoại cần có 8–15 chữ số, có thể kèm mã quốc gia.'); return; }
    pending.current = true;
    setSaving(true); setError(''); setSaved(false);
    try {
      await updateProfile({ fullName: name, phone: contact });
      setFullName(name); setPhone(contact); setSaved(true);
      form.current?.removeAttribute('data-wdp-dirty');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa lưu được hồ sơ. Thông tin bạn nhập vẫn được giữ lại để thử lại.');
    } finally { pending.current = false; setSaving(false); form.current?.removeAttribute('data-wdp-submitting'); }
  }
  return <section className="customer-page">
    <PortalPageHeader eyebrow="Tài khoản" title="Hồ sơ cá nhân" description="Cập nhật thông tin liên hệ để nhận hỗ trợ và tiếp tục đặt kho." />
    <div className="customer-profile-layout">
      <section className="customer-panel">
        <div className="customer-profile-identity"><span className="customer-profile-avatar"><UserRound size={28} /></span><div><h2>{user?.fullName}</h2><p>Tài khoản khách hàng NestBox Storage</p></div></div>
        <form ref={form} onSubmit={event => void submit(event)} className="customer-profile-readonly mt-6" aria-label="Cập nhật hồ sơ" aria-busy={saving}>
          <label className="field-label"><span><UserRound size={16} className="inline" /> Họ và tên</span><input required minLength={2} maxLength={120} autoComplete="name" value={fullName} disabled={saving} onChange={event => { setFullName(event.target.value); edit(); }} /></label>
          <label className="field-label"><span><Phone size={16} className="inline" /> Số điện thoại</span><input required type="tel" autoComplete="tel" minLength={8} maxLength={25} value={phone} disabled={saving} onChange={event => { setPhone(event.target.value); edit(); }} aria-describedby="profile-phone-help" /></label>
          <small id="profile-phone-help">Nhập số bạn đang sử dụng để NestBox liên hệ về đơn thuê và lịch hẹn.</small>
          <label className="field-label"><span><AtSign size={16} className="inline" /> Email đăng nhập</span><input type="email" value={user?.email ?? ''} readOnly aria-describedby="profile-email-help" /></label>
          <small id="profile-email-help">Email nhận mã xác minh và hồ sơ thuê được giữ theo tài khoản đăng nhập.</small>
          {error && <div className="booking-alert is-error" role="alert">{error}</div>}
          {saved && <div className="booking-alert is-success" role="status">Đã cập nhật hồ sơ của bạn.</div>}
          <div className="portal-actions"><button className="button-primary" type="submit" disabled={saving || !changed}>{saving ? 'Đang lưu…' : 'Lưu thông tin'}</button>{destination && !changed && <Link className="button-secondary" to={destination}>Tiếp tục đặt kho</Link>}</div>
        </form>
      </section>
      <aside className="customer-panel customer-profile-readonly"><h2><ShieldCheck size={18} className="inline" /> Thông tin tài khoản</h2><p>Vai trò: Khách hàng</p><p>Họ tên và số điện thoại cập nhật sẽ được sử dụng cho các yêu cầu tiếp theo. Hồ sơ, hóa đơn và hợp đồng đã phát hành vẫn giữ nội dung đã ghi nhận.</p>{destination && <p>Lựa chọn kho của bạn đã được giữ trong bản nháp. Lưu thông tin rồi bấm “Tiếp tục đặt kho” để quay lại.</p>}</aside>
    </div>
  </section>;
}

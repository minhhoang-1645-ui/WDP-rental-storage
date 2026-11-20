import { useRef, useState, type FormEvent } from 'react';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { authApi } from '../../services/booking';

export function SecuritySettings() {
  const locked = useRef(false);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const fields = new FormData(event.currentTarget);
    const currentPassword = String(fields.get('currentPassword') ?? '');
    const newPassword = String(fields.get('newPassword') ?? '');
    const confirmation = String(fields.get('confirmation') ?? '');
    setSaved(false);
    if (!currentPassword.trim()) { setError('Nhập mật khẩu hiện tại.'); return; }
    if (!newPassword.trim() || newPassword.length < 8 || newPassword.length > 128) { setError('Mật khẩu mới phải có 8–128 ký tự.'); return; }
    if (newPassword !== confirmation) { setError('Mật khẩu xác nhận không khớp.'); return; }
    if (newPassword === currentPassword) { setError('Mật khẩu mới phải khác mật khẩu hiện tại.'); return; }

    locked.current = true;
    setSaving(true);
    setError('');
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setRevision(value => value + 1);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa đổi được mật khẩu. Vui lòng thử lại.');
    } finally { locked.current = false; setSaving(false); }
  }

  return <section aria-labelledby="account-security-title">
    <header className="account-settings-section-heading">
      <h2 id="account-security-title">Bảo mật</h2>
      <p id="password-policy">Mật khẩu mới cần có 8–128 ký tự.</p>
    </header>
    <form key={revision} className="account-settings-form" aria-label="Đổi mật khẩu" aria-busy={saving} data-wdp-draft="ignore"
      onSubmit={submit} onChange={() => { setError(''); setSaved(false); }} noValidate>
      <label className="field-label">Mật khẩu hiện tại<PasswordInput name="currentPassword" autoComplete="current-password" maxLength={128} required disabled={saving} /></label>
      <label className="field-label">Mật khẩu mới<PasswordInput name="newPassword" autoComplete="new-password" minLength={8} maxLength={128} required disabled={saving} aria-describedby="password-policy" /></label>
      <label className="field-label">Xác nhận mật khẩu mới<PasswordInput name="confirmation" autoComplete="new-password" maxLength={128} required disabled={saving} /></label>
      {error && <p className="account-settings-message is-error" role="alert">{error}</p>}
      {saved && <p className="account-settings-message is-success" role="status">Đã đổi mật khẩu. Các phiên đăng nhập khác đã kết thúc.</p>}
      <div className="account-settings-actions">
        <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu mật khẩu mới'}</button>
      </div>
    </form>
  </section>;
}

import { Check, Moon, Palette, Sun, UserRound } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useBeforeUnload, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { label as roleLabel } from '../../components/manager/portal-data';
import { useAuth } from '../../auth/auth-context';
import { portalDestination, roleReturnPath } from '../../auth/portal-routing';
import { useWorkspaceTheme, type WorkspaceTheme } from '../../hooks/useWorkspaceTheme';
import type { PublicUser } from '../../types/booking';
import '../../styles/account-settings.css';

const sections = [
  { id: 'profile', label: 'Hồ sơ cá nhân', icon: UserRound },
  { id: 'appearance', label: 'Giao diện', icon: Palette },
] as const;

type Contact = Pick<PublicUser, 'fullName' | 'phone'>;

export function AccountSettingsPage() {
  const { user } = useAuth();
  const { section = 'profile' } = useParams();
  const { search } = useLocation();
  if (!user) return null;

  const base = `${portalDestination(user.role)}/settings`;
  if (!sections.some(item => item.id === section)) return <Navigate to={base + '/profile' + search} replace />;

  return <section className="account-settings">
    <header className="account-settings-heading">
      <h1>Cài đặt tài khoản</h1>
      <p>Quản lý hồ sơ và giao diện NestBox của bạn.</p>
    </header>
    <div className="account-settings-layout">
      <nav className="account-settings-nav" aria-label="Cài đặt tài khoản">
        {sections.map(({ id, label, icon: Icon }) => <Link key={id}
          to={`${base}/${id}${search}`} aria-current={section === id ? 'page' : undefined}>
          <Icon size={18} aria-hidden="true" />{label}
        </Link>)}
      </nav>
      <div className="account-settings-content">
        <div hidden={section !== 'profile'}><ProfileSettings key={user.id} user={user} /></div>
        {section === 'appearance' && <AppearanceSettings />}
      </div>
    </div>
  </section>;
}

function ProfileSettings({ user }: { user: PublicUser }) {
  const { updateProfile } = useAuth();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Partial<Contact>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string }>();
  const pending = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const fullName = draft.fullName ?? user.fullName;
  const phone = draft.phone ?? user.phone ?? '';
  const changes: Partial<Contact> = {};
  if (fullName.trim() !== user.fullName) changes.fullName = fullName.trim();
  if (phone.trim() !== (user.phone ?? '')) changes.phone = phone.trim();
  const changed = Object.keys(changes).length > 0;
  const returnTo = params.get('returnTo');
  const destination = returnTo && user.role === 'CUSTOMER' ? roleReturnPath(user.role, returnTo) : null;
  const initials = user.fullName.trim().split(/\s+/).filter(Boolean);
  const avatar = [initials[0], initials.length > 1 ? initials.at(-1) : '']
    .map(name => Array.from(name ?? '')[0] ?? '').join('').toLocaleUpperCase('vi');

  useLayoutEffect(() => {
    if (!changed) form.current?.removeAttribute('data-wdp-dirty');
  });

  useBeforeUnload(event => {
    if (!changed) return;
    event.preventDefault();
    event.returnValue = '';
  });

  function edit(field: keyof Contact, value: string) {
    setDraft(previous => ({ ...previous, [field]: value }));
    setMessage(undefined);
  }

  function discard() {
    setDraft({});
    setMessage(undefined);
    form.current?.removeAttribute('data-wdp-dirty');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!changed) { form.current?.removeAttribute('data-wdp-submitting'); return; }
    const name = changes.fullName;
    const contact = changes.phone;
    if (name !== undefined && (name.length < 2 || name.length > 120)) {
      form.current?.removeAttribute('data-wdp-submitting');
      setMessage({ type: 'error', text: 'Họ và tên phải có 2–120 ký tự.' });
      return;
    }
    if (contact !== undefined && (!/^\+?[\d\s().-]{8,25}$/.test(contact) || !/^\d{8,15}$/.test(contact.replace(/\D/g, '')))) {
      form.current?.removeAttribute('data-wdp-submitting');
      setMessage({ type: 'error', text: 'Số điện thoại cần có 8–15 chữ số, có thể kèm mã quốc gia.' });
      return;
    }

    pending.current = true;
    setSaving(true);
    setMessage(undefined);
    try {
      await updateProfile(changes);
      setDraft({});
      form.current?.removeAttribute('data-wdp-dirty');
      setMessage({ type: 'success', text: 'Đã cập nhật hồ sơ của bạn.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Chưa lưu được hồ sơ. Vui lòng thử lại.' });
    } finally {
      pending.current = false;
      setSaving(false);
      form.current?.removeAttribute('data-wdp-submitting');
    }
  }

  return <section aria-labelledby="account-profile-title">
    <header className="account-settings-section-heading">
      <h2 id="account-profile-title">Hồ sơ cá nhân</h2>
      <p>Cập nhật thông tin liên hệ của bạn.</p>
    </header>
    <div className="account-settings-identity">
      <span className="account-settings-avatar" aria-hidden="true">{avatar || <UserRound size={22} />}</span>
      <div><strong>{user.fullName}</strong><small>{roleLabel(user.role)}</small></div>
    </div>
    <form ref={form} className="account-settings-form" aria-label="Cập nhật hồ sơ"
      data-wdp-dirty={changed ? 'true' : undefined} aria-busy={saving} onSubmit={submit}>
      <label className="field-label">Họ và tên
        <input autoComplete="name" maxLength={120} value={fullName} disabled={saving} onChange={event => edit('fullName', event.target.value)} />
      </label>
      <label className="field-label">Số điện thoại
        <input type="tel" autoComplete="tel" maxLength={25} value={phone} disabled={saving} onChange={event => edit('phone', event.target.value)} />
      </label>
      <label className="field-label">Email đăng nhập
        <input type="email" value={user.email} readOnly />
      </label>
      {message && <p className={`account-settings-message is-${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      {changed && !saving && <small className="account-settings-muted">Có thay đổi chưa lưu.</small>}
      <div className="account-settings-actions">
        <button className="button-primary" type="submit" disabled={!changed || saving}>{saving ? 'Đang lưu…' : 'Lưu thông tin'}</button>
        {changed && <button className="button-secondary" type="button" onClick={discard} disabled={saving}>Bỏ thay đổi</button>}
        {destination && !changed && <Link className="button-secondary" to={destination}>Tiếp tục đặt kho</Link>}
      </div>
    </form>
  </section>;
}

const themes: { id: WorkspaceTheme; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Sáng', icon: Sun },
  { id: 'dark', label: 'Tối', icon: Moon },
];

function AppearanceSettings() {
  const { theme, setTheme } = useWorkspaceTheme(true);
  return <section aria-labelledby="account-appearance-title">
    <header className="account-settings-section-heading">
      <h2 id="account-appearance-title">Giao diện</h2>
      <p>Chọn chế độ hiển thị cho khu vực làm việc.</p>
    </header>
    <fieldset className="account-settings-theme">
      <legend>Chế độ màu</legend>
      <div className="account-theme-options">
        {themes.map(({ id, label, icon: Icon }) => <label key={id} className="account-theme-option" data-preview={id}>
          <input type="radio" name="workspace-theme" value={id} checked={theme === id} onChange={() => setTheme(id)} />
          <span className="account-theme-preview" aria-hidden="true">
            <span className="account-preview-sidebar"><i /><i /><i /></span>
            <span className="account-preview-main"><i /><b /><b /></span>
          </span>
          <span className="account-theme-caption"><Icon size={17} aria-hidden="true" />{label}{theme === id && <Check size={18} aria-hidden="true" />}</span>
        </label>)}
      </div>
    </fieldset>
  </section>;
}

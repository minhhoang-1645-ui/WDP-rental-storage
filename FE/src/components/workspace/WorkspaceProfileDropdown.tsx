import { ChevronDown, LogOut, Moon, Palette, Sun, UserRound } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { WorkspaceTheme } from '../../hooks/useWorkspaceTheme';
import type { PublicUser } from '../../types/booking';
import '../../styles/workspace-profile.css';

export function WorkspaceProfileDropdown({ user, roleLabel, theme, onToggleTheme, onProfile, onAppearance, onLogout }: {
  user: PublicUser;
  roleLabel: string;
  theme: WorkspaceTheme;
  onToggleTheme: () => void;
  onProfile: () => void;
  onAppearance: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const profile = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const names = user.fullName.trim().split(/\s+/);
  const initials = [names[0], names.length > 1 ? names.at(-1) : undefined]
    .map(name => Array.from(name ?? '')[0] ?? '').join('').toLocaleUpperCase('vi');
  const dark = theme === 'dark';

  useEffect(() => {
    if (!open) return;
    profile.current?.focus();
    function dismissOutside(event: PointerEvent) {
      if (root.current && !event.composedPath().includes(root.current)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  function closeAndRestoreFocus() {
    setOpen(false);
    trigger.current?.focus();
  }

  return <div
    className="workspace-profile"
    ref={root}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={event => {
      if (!open || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
    }}
  >
    <button ref={trigger} type="button" className="workspace-profile-trigger" aria-label="Menu tài khoản"
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span className="workspace-profile-initials" aria-hidden="true">{initials || <UserRound size={17} />}</span>
      <span className="workspace-profile-name" aria-hidden="true">{user.fullName}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    <div id={panelId} className="workspace-profile-panel" hidden={!open}>
      <div className="workspace-profile-identity">
        <b>{user.fullName}</b>
        <span>{user.email}</span>
        <span>{roleLabel}</span>
      </div>
      <div className="workspace-profile-actions">
        <button ref={profile} type="button" onClick={() => { closeAndRestoreFocus(); onProfile(); }}>
          <UserRound size={17} aria-hidden="true" />Thông tin cá nhân
        </button>
        <button type="button" onClick={() => { closeAndRestoreFocus(); onAppearance(); }}>
          <Palette size={17} aria-hidden="true" />Cài đặt giao diện
        </button>
        <button type="button" onClick={onToggleTheme} aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>
          {dark ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
          Giao diện <span className="workspace-profile-theme">{dark ? 'Tối' : 'Sáng'}</span>
        </button>
      </div>
      <div className="workspace-profile-actions workspace-profile-signout">
        <button type="button" onClick={() => { setOpen(false); onLogout(); }}>
          <LogOut size={17} aria-hidden="true" />Đăng xuất
        </button>
      </div>
    </div>
  </div>;
}

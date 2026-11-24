import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { Modal } from '../../components/manager/PortalUi';

type SearchResults = { items: { id: string; fullName: string; email: string }[] };

export function AdminSearch() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const term = input.trim();
  useEffect(() => {
    function openShortcut(event: KeyboardEvent) {
      const target = event.target;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' ||
        (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', openShortcut);
    return () => window.removeEventListener('keydown', openShortcut);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(term), 250);
    return () => window.clearTimeout(timer);
  }, [term]);
  const source = useApiResource<SearchResults>(
    open && search === term && term.length > 1 ? '/admin/users?limit=6&search=' + encodeURIComponent(search) : null,
    user?.id,
  );
  const direct = /^[a-z0-9_-]{20,120}$/i.test(term) ? '/admin/users/' + encodeURIComponent(term) : null;
  const byId = useApiResource<SearchResults['items'][number]>(open && term === search ? direct : null, user?.id);
  const items = byId.data && !source.data?.items.some(item => item.id === byId.data?.id)
    ? [byId.data, ...(source.data?.items ?? [])] : source.data?.items ?? [];

  return <>
    <button className="button-secondary admin-search-trigger" type="button" aria-label="Tìm kiếm tài khoản, vai trò, hoạt động" aria-keyshortcuts="Control+K Meta+K" onClick={() => setOpen(true)}>
      <Search size={18} aria-hidden="true" /><span>Tìm kiếm tài khoản, vai trò, hoạt động...</span><kbd>Ctrl K</kbd>
    </button>
    {open && <Modal title="Tìm kiếm trong quản trị" className="admin-search-dialog" onClose={() => setOpen(false)}>
      <label className="field-label">Tên, email hoặc mã tài khoản
        <input autoFocus type="search" value={input} maxLength={120} onChange={event => setInput(event.target.value)} onKeyDown={event => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          setOpen(false);
        }} />
      </label>
      {term.length > 1 && <div className="admin-search-results" aria-live="polite">
        {search !== term || source.loading || byId.loading ? <p>Đang tìm…</p>
          : items.length ? <ul>{items.map(item => <li key={item.id}>
            <Link to={'/admin/users/' + encodeURIComponent(item.id)} onClick={() => setOpen(false)}>
              <strong>{item.fullName}</strong><small>{item.email}</small>
            </Link>
          </li>)}</ul> : <p>{source.error || (byId.status !== 404 && byId.error) || 'Không tìm thấy tài khoản phù hợp.'}</p>}
        {search === term && <div className="portal-actions">
          <Link to={'/admin/users?search=' + encodeURIComponent(search)} onClick={() => setOpen(false)}>Tìm tài khoản</Link>
          <Link to="/admin/roles" onClick={() => setOpen(false)}>Xem vai trò</Link>
          <Link to={'/admin/activity?search=' + encodeURIComponent(search.slice(0, 100))} onClick={() => setOpen(false)}>Tìm hoạt động</Link>
        </div>}
      </div>}
    </Modal>}
  </>;
}

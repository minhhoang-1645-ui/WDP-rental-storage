import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useLiveRefresh } from '../../services/live-events';
import { apiRequest } from '../../services/api';
import { first, type Page } from '../../components/manager/portal-data';
import { LoadState, PageHeader, Status } from '../../components/manager/PortalUi';
import { InternalKpis } from '../../components/workspace/InternalDashboard';

export function AdminDashboardPage() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useLiveRefresh('/admin/users', refresh);
  const key = `${user?.id}:${revision}`;
  const [state, setState] = useState<{ key: string; pages?: Page[]; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['/admin/users?page=1&limit=5', '/admin/users?page=1&limit=1&role=STAFF', '/admin/users?page=1&limit=1&role=MANAGER', '/admin/users?page=1&limit=1&accountStatus=DISABLED'].map(path => apiRequest<Page>(path, { signal: controller.signal })))
      .then(pages => { if (!controller.signal.aborted) setState({ key, pages }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Không thể tải tài khoản.' }); });
    return () => controller.abort();
  }, [key]);
  const current = state?.key === key ? state : undefined;
  return <section>
    <PageHeader title="Tổng quan quản trị"><button className="button-secondary" disabled={!current} onClick={refresh}><RefreshCw size={16} />Làm mới</button></PageHeader>
    <LoadState loading={!current} error={current?.error ?? ''} retry={refresh} />
    <InternalKpis items={[
      { title: 'Tổng tài khoản', value: current?.pages?.[0].total ?? '—', to: '/admin/users' },
      { title: 'Nhân viên', value: current?.pages?.[1].total ?? '—', to: '/admin/users?role=STAFF' },
      { title: 'Quản lý', value: current?.pages?.[2].total ?? '—', to: '/admin/users?role=MANAGER' },
      { title: 'Đã vô hiệu hóa', value: current?.pages?.[3].total ?? '—', to: '/admin/users?status=DISABLED' },
    ]} />
    {current?.pages && <section className="internal-priority"><div className="internal-section-heading"><h2>Tài khoản gần đây</h2><Link className="portal-text-button" to="/admin/users">Xem tất cả</Link></div>
      {!current.pages[0].items.length && <p>Chưa có tài khoản.</p>}
      <ul className="internal-task-list">{current.pages[0].items.slice(0, 5).map(row => <li key={first(row, 'id')}><Link to={`/admin/users?search=${encodeURIComponent(first(row, 'email'))}`}><div><strong>{first(row, 'fullName')}</strong><small>{first(row, 'email')}</small></div><Status value={row.accountStatus} /></Link></li>)}</ul>
    </section>}
    <div className="internal-shortcuts"><Link className="button-secondary" to="/admin/login-history">Lịch sử đăng nhập</Link><Link className="button-secondary" to="/admin/activity">Lịch sử hoạt động</Link></div>
  </section>;
}

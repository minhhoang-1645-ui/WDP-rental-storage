import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
type Item = { id: string; contractCode: string; customer: { fullName: string }; storageUnit: { unitNumber: string }; returnRequest: { id: string } | null };
export function OverstayNotice() {
  const { user } = useAuth(), staff = user?.role === 'STAFF';
  const result = useApiResource<{ total: number; items: Item[] }>(staff ? '/staff/management/overstays' : '/manager/overstays', user?.id, true);
  if (!result.data?.total) return null;
  return <section className="manager-section" aria-label="Kho đến hạn chưa trả"><h2>{result.data.total} kho đã đến hạn, chưa trả xong</h2><p>Liên hệ khách lấy hàng, kiểm tra và hoàn tất trả kho. Kho vẫn bị chặn, không tự phát sinh phí trễ hạn.</p>{result.data.items.slice(0, 3).map(row => <p key={row.id}><Link to={staff && row.returnRequest ? `/staff/returns/${row.returnRequest.id}` : `${staff ? '/staff' : '/manager/operations'}/rentals/${row.id}`}>{row.storageUnit.unitNumber} · {row.customer.fullName} · {row.contractCode}</Link></p>)}<Link className="button-secondary" to={staff ? '/staff/overstays' : '/manager/overstays'}>Xem tất cả kho đến hạn chưa trả</Link></section>;
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import type { Page } from '../../components/manager/portal-data';
import { LoadState, PageHeader } from '../../components/manager/PortalUi';

type Overstay = { id: string; contractCode: string; reference: string; overdueDays: number; endDate: string; customer: { fullName: string; phone: string }; storageUnit: { unitNumber: string; floor: string | null; zone: string | null }; storedItems: { id: string; name: string; balance: number; unit: string }[]; returnRequest: { id: string; status: string } | null };
export function OverstayPage() {
  const { user } = useAuth(), staff = user?.role === 'STAFF';
  const [page, setPage] = useState(1);
  const result = useApiResource<Page<Overstay>>(`${staff ? '/staff/management/overstays' : '/manager/overstays'}?page=${page}`, user?.id, true);
  return <section><PageHeader title="Đến hạn nhưng chưa trả kho" description="Kho vẫn được giữ, không tự mở bán khi còn hàng hoặc chưa hoàn tất kiểm tra. Không tự tính phí trễ hạn." /><LoadState loading={result.loading} error={result.error} retry={result.refresh} />{result.data?.items.map(row => <article className="manager-section" key={row.id}><h2>{row.storageUnit.unitNumber} · {row.customer.fullName}</h2><p>{row.storageUnit.floor} · {row.storageUnit.zone} · {row.customer.phone}</p><p>Hết kỳ ngày {row.endDate} · {row.overdueDays} ngày chưa hoàn tất trả · {row.contractCode}</p><ul>{row.storedItems.map(item => <li key={item.id}>{item.name}: {item.balance} {item.unit}</li>)}</ul>{!row.storedItems.length && <p>Không còn hàng trong sổ. Cần kiểm tra và hoàn tất hồ sơ trả kho.</p>}<Link className="button-primary" to={staff ? row.returnRequest ? `/staff/returns/${row.returnRequest.id}` : `/staff/rentals/${row.id}` : `/manager/operations/rentals/${row.id}`}>{staff ? row.returnRequest ? 'Xử lý trả kho' : 'Xem kho và liên hệ khách' : 'Xem hồ sơ thuê'}</Link></article>)}{result.data?.total === 0 && <p>Không có kho đến hạn chưa trả.</p>}<div className="portal-actions"><button className="button-secondary" disabled={!result.data || result.data.page <= 1} onClick={() => setPage(result.data!.page - 1)}>Trang trước</button><button className="button-secondary" disabled={!result.data || result.data.page * result.data.limit >= result.data.total} onClick={() => setPage(result.data!.page + 1)}>Trang sau</button></div></section>;
}

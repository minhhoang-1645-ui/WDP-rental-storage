import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import type { Page } from '../../components/manager/portal-data';
import { LoadState, PageHeader } from '../../components/manager/PortalUi';
import { DetailCard } from '../../components/workspace/DetailRow';
import { InternalPagination } from '../../components/workspace/InternalPagination';

type Overstay = { id: string; reservationId: string; contractCode: string; reference: string; overdueDays: number; endDate: string; customer: { fullName: string; phone: string }; storageUnit: { unitNumber: string; floor: string | null; zone: string | null }; returnRequest: { id: string; status: string } | null };
export function OverstayPage() {
  const { user } = useAuth(), staff = user?.role === 'FACILITY_STAFF';
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
  const setPage = (nextPage: number) => setParams({ page: String(nextPage) }, { replace: true });
  const result = useApiResource<Page<Overstay>>(`${staff ? '/staff/management/overstays' : '/manager/overstays'}?page=${page}`, user?.id, true);
  return <section>
    <PageHeader title="Đến hạn nhưng chưa trả kho" description="Kho vẫn được giữ cho đến khi xác nhận đã dọn trống và hoàn tất kiểm tra hiện trạng. Nếu hợp đồng có điều khoản quá hạn, phí được tính khi xác nhận ngày nhận kho thực tế." />
    <LoadState loading={result.loading} error={result.error} retry={result.refresh} />
    {result.data?.items.map(row => {
      const id = encodeURIComponent(row.reservationId);
      const to = !staff ? `/manager/operations/rentals/${id}`
        : row.returnRequest ? `/staff/returns/${encodeURIComponent(row.returnRequest.id)}` : `/staff/rentals/${id}`;
      return <DetailCard className="manager-section" key={row.id} detail={{ to, label: `Xem hồ sơ kho quá hạn ${row.storageUnit.unitNumber}` }}>
        <h2>{row.storageUnit.unitNumber} · {row.customer.fullName}</h2>
        <p>{row.storageUnit.floor} · {row.storageUnit.zone} · {row.customer.phone}</p>
        <p>Hết kỳ ngày {row.endDate} · {row.overdueDays === 0 ? 'Đến hạn hôm nay' : 'Quá hạn ' + row.overdueDays + ' ngày'} · {row.contractCode}</p>
        <Link className="button-primary" to={to}>{staff ? row.returnRequest ? 'Xử lý trả kho' : 'Xem kho và liên hệ khách' : 'Xem hồ sơ thuê'}</Link>
      </DetailCard>;
    })}
    {result.data?.total === 0 && <p>Không có kho đến hạn chưa trả.</p>}
    {result.data && <InternalPagination page={result.data.page} limit={result.data.limit} total={result.data.total} onChange={setPage} />}
  </section>;
}

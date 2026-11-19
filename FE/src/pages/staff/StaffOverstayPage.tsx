import { Link, useSearchParams } from 'react-router-dom';
import { date } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { InternalPagination } from '../../components/workspace/InternalPagination';

import { staffOverstayTarget, useStaffOverstays, type Overstay } from './staff-overstays';

export function StaffOverstayStatus({ row }: { row: Overstay }) {
  return row.returnRequest ? <Status value={row.returnRequest.status} /> : <Status value="OVERDUE" text="Chưa nhận lại kho" />;
}

const columns: StaffColumn<Overstay>[] = [
  { key: 'unit', label: 'Kho', cell: row => <strong>{row.storageUnit.unitNumber}</strong> },
  { key: 'customer', label: 'Khách hàng', cell: row => row.customer.fullName },
  { key: 'end', label: 'Ngày hết hạn', cell: row => date(row.endDate) },
  { key: 'days', label: 'Quá hạn', cell: row => `${row.overdueDays} ngày` },
  { key: 'status', label: 'Trạng thái', cell: row => <StaffOverstayStatus row={row} /> },
  { key: 'action', label: 'Thao tác', cell: row => <Link className="button-secondary" to={staffOverstayTarget(row)}>Xem chi tiết</Link> },
];

export function StaffOverstayPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.min(100000, Math.max(1, Math.floor(Number(params.get('page')) || 1)));
  const result = useStaffOverstays(page);
  return <section>
    <PageHeader title="Kho quá hạn chưa trả" description="Kho còn được giữ và thuộc phạm vi phụ trách của bạn." />
    <RefreshStatus active={result.refreshing} />
    <LoadState loading={result.loading} error={result.error} retry={result.refresh}
      placeholder={<StaffTaskTable title="Kho quá hạn chưa trả" items={[]} columns={columns} rowKey={row => row.id} loadingRows={5} />} />
    {result.data && <>
      {result.data.items.length ? <StaffTaskTable title="Kho quá hạn chưa trả" columns={columns} items={result.data.items} rowKey={row => row.id} rowDetail={row => ({ to: staffOverstayTarget(row), label: `Xem hồ sơ kho quá hạn ${row.storageUnit.unitNumber}` })} />
        : <Empty title="Không có kho quá hạn ở trang này" description="Kiểm tra lại khi có thay đổi về phân công hoặc trả kho." />}
      <InternalPagination page={result.data.page} limit={result.data.limit} total={result.data.total}
        onChange={value => setParams(value === 1 ? {} : { page: String(value) }, { replace: true })} />
    </>}
  </section>;
}

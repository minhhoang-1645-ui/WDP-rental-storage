import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { code, date, first, rows, type Row } from '../../components/manager/portal-data';
import { Facts, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';

const unitColumns: StaffColumn<Row>[] = [
  { key: 'unit', label: 'Kho', cell: item => <strong>{first(item, 'unit.unitCode')}</strong> },
  { key: 'location', label: 'Vị trí', cell: item => [first(item, 'unit.floor'), first(item, 'unit.zone')].filter(Boolean).join(' · ') || '—' },
  { key: 'status', label: 'Trạng thái kho', cell: item => <Status value={first(item, 'unit.status')} /> },
  { key: 'contract', label: 'Hợp đồng', cell: item => <CopyRecordCode value={first(item, 'contractCode')} /> },
];

export function StaffRecordPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const data = useApiResource<Row>(`/staff/rentals/${encodeURIComponent(id)}`, user?.id ?? '', false, true);
  const row = data.data;
  const returnPath = useInternalListReturn('/staff/rentals');
  const contracts = rows(row?.contracts);
  const phone = row && first(row, 'customer.phone');
  const email = row && first(row, 'customer.email');
  return <section className="record-detail-page">
    <Link className="booking-back" to={returnPath}><ArrowLeft size={16} aria-hidden="true" />Về danh sách</Link>
    {(row || !data.loading) && <PageHeader title={row ? [first(row, 'storageType.name') || 'Kho đang thuê', first(row, 'customer.fullName')].filter(Boolean).join(' · ') : 'Kho đang thuê'}
      status={row && <Status value={row.rentalState} />} meta={row && <CopyRecordCode value={code(row)} />}>
      <button type="button" className="button-secondary" aria-label="Làm mới hồ sơ" onClick={data.refresh}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>
      <RefreshStatus active={data.refreshing} />
    </PageHeader>}
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} layout="detail" />
    {row && <div className="staff-record-stack">
      <section className="manager-section">
        <h2>Kỳ thuê</h2>
        <Facts items={[
          ['Loại kho', first(row, 'storageType.name') || '—'],
          ['Ngày bắt đầu', date(first(row, 'startDate'))],
          ['Ngày hết hạn', date(first(row, 'effectiveEndDate', 'endDate'))],
          ...(phone ? [['Điện thoại', <a key="phone" href={`tel:${phone}`}>{phone}</a>]] as const : []),
          ...(email ? [['Email', <a key="email" href={`mailto:${email}`}>{email}</a>]] as const : []),
        ].map(([label, value]) => [label, value])} />
      </section>
      {!!contracts.length && <section className="manager-section">
        <h2>Kho đang sử dụng</h2>
        <StaffTaskTable title="Kho đang sử dụng" columns={unitColumns} items={contracts} rowKey={item => first(item, 'id')} />
      </section>}
    </div>}
  </section>;
}

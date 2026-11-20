import { RefreshCw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { ManagerTaskTable, ManagerTableSearch, ManagerTableFilter } from '../../components/manager/ManagerTaskTable';
import { useManagerTableParams } from '../../components/manager/manager-table-params';
import { PageHeader, Status } from '../../components/manager/PortalUi';
import { code, customer, date, detailPath, first, label, rows, type Row } from '../../components/manager/portal-data';
import type { StaffColumn } from '../../components/workspace/StaffTaskTable';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { normalizeSearch } from '../../utils/notification-tools';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { managerRefundTitle, managerSections } from '../../utils/manager-sections';
import { hasLinkedTransfer } from '../../utils/work-queue';
import { isCustomerTransferSubject } from '../../utils/transfer-request';
const queuePaths = {
  deposits: '/manager/deposit-settlements',
  maintenance: '/manager/maintenance',
  support: '/manager/support-requests',
  early: '/manager/early-return-requests',
  damage: '/manager/damage-claims',
  transfers: '/manager/transfers',
  renewals: '/manager/renewals',
} as const;

type Queue = keyof typeof queuePaths;
type Task = { queue: Queue; row: Row; status: string; statusText: string; created: string; reference: string; person: string; unit: string; to: string };

const titles: Record<Queue, string> = {
  deposits: managerRefundTitle,
  maintenance: 'Nghiệm thu bảo trì', support: 'Hỗ trợ chuyển cấp', early: 'Trả kho trước hạn', damage: 'Sự cố hàng hóa',
  transfers: 'Chuyển kho',
  renewals: 'Gia hạn kho',
};
const statusNames: Record<string, string> = {
  REQUESTED: 'Chờ duyệt chuyển kho', PENDING: 'Chờ duyệt gia hạn',
  PENDING_REVIEW: 'Chờ duyệt',
  AWAITING_VERIFICATION: 'Chờ kiểm tra kết quả', ESCALATED: 'Cần quản lý quyết định', EARLY_REVIEW: 'Chờ quyết định',
  INVESTIGATING: 'Chờ quyết định sự cố', APPROVED: 'Đã chấp thuận · chờ kết thúc', REJECTED: 'Đã từ chối · chờ kết thúc',
};
const queueStates: Record<Queue, string[]> = {
  deposits: ['PENDING_REVIEW'],
  maintenance: ['AWAITING_VERIFICATION'], support: ['ESCALATED'], early: ['EARLY_REVIEW'],
  damage: ['INVESTIGATING', 'APPROVED', 'REJECTED'],
  transfers: ['REQUESTED'],
  renewals: ['PENDING'],
};
const fullLists: Record<Queue, string> = {
  deposits: '/manager/operations/deposit-settlements', maintenance: '/manager/operations/maintenance',
  support: '/manager/operations/support-requests', early: '/manager/early-returns', damage: queuePaths.damage,
  transfers: '/manager/operations/transfers',
  renewals: '/manager/operations/renewals',
};

function toTask(queue: Queue, row: Row, from: string, legacyTransfer = false): Task | null {
  const id = first(row, 'id');
  const status = first(row, 'status');
  if (!id) return null;
  const search = new URLSearchParams({ from });
  let to = fullLists[queue];
  let state = status;
  switch (queue) {
    case 'deposits':
      if (status !== 'PENDING_REVIEW') return null;
      to = detailPath('deposit-settlements', { id });
      break;
    case 'maintenance':
      if (status !== 'AWAITING_VERIFICATION') return null;
      to = detailPath('maintenance', { id });
      break;
    case 'support':
      if (status !== 'ESCALATED' || isEarlyReturnRequest(row) || isCustomerTransferSubject(row.subject) || hasLinkedTransfer(row)) return null;
      to = detailPath('support-requests', { id });
      break;
    case 'early':
      if (row.decision || !['OPEN', 'ESCALATED'].includes(status)) return null;
      state = 'EARLY_REVIEW';
      search.set('record', id);
      break;
    case 'renewals':
      if (status !== 'PENDING') return null;
      to = detailPath('renewals', { id });
      break;
    case 'transfers':
      if (legacyTransfer ? !isCustomerTransferSubject(row.subject) || status === 'RESOLVED' || rows(row.transfers).length > 0 : status !== 'REQUESTED') return null;
      state = 'REQUESTED';
      to = detailPath(legacyTransfer ? 'support-requests' : 'transfers', { id });
      break;
    case 'damage':
      if (!(status === 'INVESTIGATING' && row.staffFacts) && !['APPROVED', 'REJECTED'].includes(status)) return null;
      search.set('claim', id);
      break;
  }
  return {
    queue, row, status: state, statusText: queue === 'damage' && first(row, 'compensation.status') === 'AWAITING_HANDOVER' ? 'Chờ giao tiền' : statusNames[state],
    created: first(row, 'createdAt'),
    reference: first(row, 'claimCode') || code(row),
    person: first(customer(row), 'fullName'),
    unit: first(row, 'unit.unitCode', 'unitCodeSnapshot', 'fromUnit.unitCode') ||
      rows(row.physicalInspections).map(item => first(item, 'unit.unitCode')).filter(Boolean).join(', ') ||
      rows(row.contracts).map(item => first(item, 'unitCode')).filter(Boolean).join(', ') ||
      first(row, 'reservation.storageType.name', 'invoice.invoiceCode'),
    to: to + '?' + search,
  };
}

export function ManagerReviewInbox() {
  const { user } = useAuth();
  const { pathname, search: locationSearch } = useLocation();
  const { params, page, limit, update } = useManagerTableParams();
  const rawQueue = params.get('kind') ?? '';
  const decisionOnly = params.get('view') === 'decision';
  const queue = Object.hasOwn(queuePaths, rawQueue) ? rawQueue as Queue : '';
  const rawStatus = params.get('status') ?? '';
  const states = (queue ? queueStates[queue] : Object.keys(statusNames)).filter(value => !decisionOnly || !['APPROVED', 'REJECTED'].includes(value));
  const status = states.includes(rawStatus) ? rawStatus : '';
  const term = params.get('search') ?? '';
  const oldest = params.get('sort') === 'oldest';
  const queuePath = (kind: Queue, state = '') => !queue || queue === kind
    ? queuePaths[kind] + '?limit=100' + (state ? '&status=' + state : '')
    : null;
  const deposits = usePaginatedResource<Row>(queuePath('deposits', 'PENDING_REVIEW'), user?.id, true);
  const maintenance = usePaginatedResource<Row>(queuePath('maintenance', 'AWAITING_VERIFICATION'), user?.id, true);
  const support = usePaginatedResource<Row>(queuePath('support', 'ESCALATED'), user?.id, true);
  const early = usePaginatedResource<Row>(queuePath('early'), user?.id, true);
  const damage = usePaginatedResource<Row>(queuePath('damage'), user?.id, true);
  const transfers = usePaginatedResource<Row>(queuePath('transfers', 'REQUESTED'), user?.id, true);
  const legacyTransfers = usePaginatedResource<Row>(!queue || queue === 'transfers' ? '/manager/support-requests?legacyTransfer=true&limit=100' : null, user?.id, true);
  const renewals = usePaginatedResource<Row>(queuePath('renewals', 'PENDING'), user?.id, true);
  const sources = { deposits, maintenance, support, early, damage, transfers, renewals };
  const resources = [...Object.values(sources), legacyTransfers];
  const loading = resources.some(resource => resource.loading);
  const refreshing = resources.some(resource => resource.refreshing);
  const errors = Object.entries(sources).filter(([, resource]) => resource.error).map(([kind]) => titles[kind as Queue]);
  if (legacyTransfers.error && !transfers.error) errors.push(titles.transfers);
  const refresh = () => resources.forEach(resource => resource.refresh());
  const tasks = (Object.entries(sources) as [Queue, typeof deposits][]).flatMap(([kind, resource]) =>
    (resource.data?.items ?? []).map(row => toTask(kind, row, pathname + locationSearch)).filter((task): task is Task => task !== null));
  for (const row of legacyTransfers.data?.items ?? []) {
    const task = toTask('transfers', row, pathname + locationSearch, true);
    if (task) tasks.push(task);
  }
  const matching = tasks.filter(task => (!status || task.status === status) &&
    (!decisionOnly || task.queue !== 'damage' || task.status === 'INVESTIGATING') &&
    normalizeSearch([task.reference, task.person, task.unit, titles[task.queue], first(task.row, 'subject', 'description'),
      first(task.row, 'reservation.reference', 'invoice.invoiceCode')].join(' ')).includes(normalizeSearch(term.trim())));
  matching.sort((a, b) => {
    const missingDate = Number(!a.created) - Number(!b.created);
    const byDate = a.created.localeCompare(b.created);
    return missingDate || (oldest ? byDate : -byDate) || a.reference.localeCompare(b.reference, 'vi');
  });
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(matching.length / limit)));
  const columns: StaffColumn<Task>[] = [
    { key: 'type', label: 'Loại hồ sơ', cell: task => <><strong>{titles[task.queue]}</strong><CopyRecordCode value={task.reference} /></> },
    { key: 'customer', label: 'Khách hàng / Kho', cell: task => <><strong>{task.person || task.unit || '—'}</strong>{task.person && task.unit && <small>{task.unit}</small>}</> },
    { key: 'created', label: 'Ngày tạo', sort: { direction: oldest ? 'ascending' : 'descending', toggle: () => update('sort', oldest ? '' : 'oldest') }, cell: task => date(task.created, true) },
    { key: 'priority', label: 'Ưu tiên', optional: true, cell: task => ['HIGH', 'MEDIUM', 'LOW'].includes(first(task.row, 'priority')) ? label(task.row.priority) : '—' },
    { key: 'status', label: 'Trạng thái', cell: task => <Status value={task.status} text={task.statusText} /> },
  ];
  return <section>
    <PageHeader title={managerSections.reviews.title}><button className="button-secondary" type="button" onClick={refresh} disabled={loading || refreshing}><RefreshCw size={16} /> Làm mới</button></PageHeader>
    {errors.length > 0 && <div className="booking-alert is-error" role="alert">Chưa tải được {errors.join(', ')}. <button className="button-secondary" type="button" onClick={refresh}>Thử lại</button></div>}
    <ManagerTaskTable title={managerSections.reviews.title} rowDetail={task => ({ to: task.to, label: `Xem chi tiết hồ sơ ${task.reference}` })} loading={loading} refreshing={refreshing} retry={refresh} items={matching.slice((visiblePage - 1) * limit, visiblePage * limit)}
      columns={columns} rowKey={task => task.queue + ':' + first(task.row, 'id')} total={matching.length} page={visiblePage} limit={limit} update={update}
      emptyTitle="Không có hồ sơ cần xử lý" emptyDescription={errors.length ? 'Một số nhóm yêu cầu chưa tải được. Hãy thử lại.' : undefined}
      toolbar={<>
        <ManagerTableSearch value={term} onChange={value => update('search', value)} placeholder="Tên khách, mã hồ sơ hoặc kho…" />
        <ManagerTableFilter label="Loại hồ sơ" value={queue} onChange={value => update('kind', value)}
          options={[[ '', 'Tất cả' ], ...Object.entries(titles)]} />
        <ManagerTableFilter label="Trạng thái" value={status} onChange={value => update('status', value)} options={[[ '', 'Tất cả' ], ...states.map(value => [value, statusNames[value]] as [string, string])]} />
        {queue && <Link className="button-secondary" to={fullLists[queue]}>Xem danh sách đầy đủ</Link>}
      </>} />
  </section>;
}

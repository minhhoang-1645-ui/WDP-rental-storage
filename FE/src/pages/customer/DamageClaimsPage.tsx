import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Plus, RefreshCw, Warehouse } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { Facts, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { ManagerTableBack, ManagerTableFilter, ManagerTableSearch, ManagerTaskTable } from '../../components/manager/ManagerTaskTable';
import { managerTableLink, useManagerTableParams } from '../../components/manager/manager-table-params';
import { money } from '../../components/manager/portal-data';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import type { StaffColumn } from '../../components/workspace/StaffTaskTable';
import { useApiResource } from '../../services/useApiResource';
import { ClaimActions, ClaimCompensation } from './DamageClaimActions';
import { DamageClaimForm } from './DamageClaimForm';
import { claimDate, claimEventLabels, claimRoleLabels, claimStatus, claimTitle, type Claim, type ClaimRole } from './damage-claims-model';
import '../../styles/damage-claims.css';

const roots: Record<ClaimRole, string> = {
  CUSTOMER: '/customer/damage-claims', STAFF: '/staff/management/damage-claims', MANAGER: '/manager/damage-claims',
};
const stages: Record<ClaimRole, [string, string][]> = {
  CUSTOMER: [['reported', 'Đã tiếp nhận'], ['investigating', 'Đang xử lý'], ['decided', 'Có quyết định'], ['handover', 'Chờ giao tiền'], ['resolved', 'Hoàn tất']],
  STAFF: [['reported', 'Cần kiểm tra'], ['investigating', 'Đang xử lý'], ['decided', 'Có quyết định'], ['resolved', 'Hoàn tất']],
  MANAGER: [['unassigned', 'Chờ phân công'], ['inspection', 'Chờ kiểm tra'], ['decision', 'Chờ quyết định'], ['handover', 'Chờ giao tiền'], ['notification', 'Có quyết định'], ['resolved', 'Hoàn tất']],
};
const separateStatus: Record<string, string> = { REPORTED: 'Đã tiếp nhận', INVESTIGATING: 'Đang xử lý', APPROVED: 'Chấp thuận', REJECTED: 'Từ chối', RESOLVED: 'Hoàn tất' };
const compensationLabels = { PENDING_REVIEW: 'Chờ phê duyệt', NONE: 'Không phát sinh bồi thường' };

export function DamageClaimsPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [submitted, setSubmitted] = useState('');
  const id = params.get('claim');
  const role = user?.role;
  if (!user || !role || role === 'ADMIN') return null;
  const web = `/${role.toLowerCase()}/damage-claims`;
  return <section className="claims-page">
    {id ? <ClaimDetail key={id} id={id} role={role} identity={user.id}
      back={managerTableLink(web, params, 'claim', '')} created={id === submitted} />
      : <ClaimList role={role} identity={user.id} web={web} onCreated={setSubmitted} />}
  </section>;
}

function ClaimList({ role, identity, web, onCreated }: { role: ClaimRole; identity: string; web: string; onCreated: (id: string) => void }) {
  const { params, page, limit, update } = useManagerTableParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const search = params.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const stage = stages[role].some(([key]) => key === params.get('stage')) ? params.get('stage')! : '';
  const filters = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) filters.set('search', search);
  if (stage) filters.set('stage', stage);
  const result = useApiResource<{ items: Claim[]; total: number; limit: number }>(`${roots[role]}?${filters}`, identity, true);
  const to = (claim: Pick<Claim, 'id'>) => managerTableLink(web, params, 'claim', claim.id);

  useEffect(() => {
    if (searchInput.trim() === search) return;
    const timer = window.setTimeout(() => update('search', searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, update]);

  const columns: StaffColumn<Claim>[] = [
    { key: 'title', label: 'Sự cố', cell: claim => <Link className="claims-title-link" to={to(claim)}>{claimTitle(claim.description)}</Link> },
    ...(role !== 'CUSTOMER' ? [{ key: 'customer', label: 'Khách hàng', cell: (claim: Claim) => claim.customer?.fullName ?? '—' }] : []),
    { key: 'unit', label: 'Kho', cell: claim => claim.unitCodeSnapshot },
    ...(role === 'MANAGER' ? [{ key: 'staff', label: 'Nhân viên phụ trách', cell: (claim: Claim) => claim.assignedStaff?.fullName ?? 'Chưa phân công' }] : []),
    { key: 'date', label: 'Ngày báo', cell: claim => claimDate(claim.createdAt) },
    { key: 'status', label: 'Trạng thái', cell: claim => <ClaimBadge claim={claim} role={role} /> },
    { key: 'open', label: 'Thao tác', cell: claim => <Link className="claims-open" to={to(claim)}>Xem chi tiết <ArrowRight size={15} aria-hidden="true" /></Link> },
  ];
  return <>
    <PageHeader title="Sự cố hàng hóa">
      {role === 'CUSTOMER' && <button className="button-primary" onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" />Báo sự cố</button>}
      <button className="button-secondary" onClick={result.refresh} disabled={result.refreshing}><RefreshCw size={16} aria-hidden="true" />Làm mới</button>
    </PageHeader>
    <ManagerTaskTable title="Danh sách sự cố hàng hóa" columns={columns} items={result.data?.items ?? []} rowKey={claim => claim.id}
      loading={result.loading} refreshing={result.refreshing} error={result.error} retry={result.refresh}
      page={page} limit={limit} total={result.data?.total ?? 0} update={update}
      emptyTitle="Chưa có sự cố phù hợp" emptyDescription={search || stage ? 'Thử đổi từ khóa hoặc trạng thái.' : 'Các báo cáo sự cố sẽ xuất hiện tại đây.'}
      toolbar={<div className="claims-filters">
        <ManagerTableSearch value={searchInput} onChange={setSearchInput} placeholder={role === 'CUSTOMER' ? 'Tên sự cố, mã kho hoặc mã hồ sơ' : 'Sự cố, khách hàng, mã kho hoặc mã hồ sơ'} />
        <ManagerTableFilter label="Trạng thái" value={stage} options={[[ '', 'Tất cả' ], ...stages[role]]} onChange={value => update('stage', value)} />
      </div>} />
    {creating && <DamageClaimForm close={() => setCreating(false)} saved={id => { onCreated(id); navigate(to({ id })); }} />}
  </>;
}

function ClaimBadge({ claim, role }: { claim: Claim; role: ClaimRole }) {
  const value = claim.status === 'RESOLVED' || claim.compensation?.status === 'HANDED_OVER' ? 'COMPLETED'
    : claim.compensation?.status === 'AWAITING_HANDOVER' || claim.status === 'REPORTED' ? 'PENDING' : claim.status;
  return <Status value={value} text={claimStatus(claim, role)} />;
}

function ClaimDetail({ id, role, identity, back, created }: { id: string; role: ClaimRole; identity: string; back: string; created: boolean }) {
  const path = roots[role] + '/' + encodeURIComponent(id);
  const query = new URLSearchParams({ id, limit: '1' });
  const result = useApiResource<{ items: Claim[] }>(`${roots[role]}?${query}`, identity, true, true);
  const [notice, setNotice] = useState(created ? 'Đã gửi báo cáo sự cố.' : '');
  const claim = result.data?.items.find(item => item.id === id);
  const detailError = result.error || (result.data && !claim ? 'Không tìm thấy hồ sơ sự cố.' : '');
  const saved = (message: string) => { setNotice(message); result.refresh(); };
  const payment = claim?.compensation;
  return <>
    <ManagerTableBack fallback={back} />
    {claim ? <PageHeader title={role === 'STAFF' ? claim.customer?.fullName || claim.unitCodeSnapshot || 'Chi tiết sự cố' : claimTitle(claim.description)} status={<ClaimBadge claim={claim} role={role} />}
      meta={<><span><Warehouse size={17} aria-hidden="true" />{[claim.unitCodeSnapshot, role !== 'STAFF' && claim.rentalContract?.contractCode, role !== 'STAFF' && claim.customer?.fullName].filter(Boolean).join(' · ')}</span><CopyRecordCode value={claim.claimCode} /></>}>
      <ClaimActions key={claim.updatedAt} claim={claim} role={role} path={path} saved={saved} reload={result.refresh} refreshing={result.refreshing || !!result.error} />
      <RefreshStatus active={result.refreshing} />
    </PageHeader> : <PageHeader title="Chi tiết sự cố" />}
    <LoadState loading={result.loading} error={detailError} retry={result.refresh} layout="detail" />
    {notice && !detailError && <p className="portal-success" role="status">{notice}</p>}
    {claim && <div className="claims-detail-grid">
      <div className="claims-detail-stack">
        <ClaimSection title="Thông tin sự cố">
          <Facts items={[
            ['Ngày phát hiện', claimDate(claim.discoveredOn)], ['Ngày báo', claimDate(claim.createdAt, true)],
            ...(claim.customer ? [['Khách hàng', claim.customer.fullName] as [string, string]] : []),
            ...(claim.estimatedValue != null ? [[role === 'CUSTOMER' ? 'Giá trị tôi ước tính' : 'Giá trị khách ước tính', money(claim.estimatedValue)] as [string, string]] : []),
          ]} />
          <p className="claims-text">{claim.description}</p>
        </ClaimSection>
        <ClaimSection title="Hàng bị ảnh hưởng">
          {claim.affectedItems.length ? <ul className="claims-items-list">{claim.affectedItems.map(item => <li key={item.id}>{item.name} · {item.unit}</li>)}</ul> : <p className="claims-muted">Xem tên và số lượng trong mô tả sự cố.</p>}
          {claim.evidenceLinks.length > 0 && <ul className="claims-evidence" aria-label="Chứng cứ">{claim.evidenceLinks.map((link, index) => <li key={index}><a href={link} target="_blank" rel="noopener noreferrer">Chứng cứ {index + 1} ↗</a></li>)}</ul>}
        </ClaimSection>
        <ClaimSection title="Kết quả kiểm tra">
          {claim.staffFacts ? <><p className="claims-text">{claim.staffFacts}</p>{claim.factsRecordedAt && <p className="claims-muted">{claimDate(claim.factsRecordedAt, true)}</p>}</> : <p className="claims-muted">Chưa có kết quả kiểm tra.</p>}
        </ClaimSection>
      </div>
      <div className="claims-detail-stack">
        <ClaimSection title={role === 'MANAGER' ? 'Quyết định xử lý' : 'Kết quả giải quyết'}>
          {claim.decision ? <><Status value={claim.decision} text={claim.decision === 'APPROVED' ? 'Chấp thuận hướng xử lý' : 'Từ chối đề nghị'} />
            <p className="claims-text">{claim.decisionReason}</p></> : <p className="claims-muted">Chờ quyết định xử lý.</p>}
          {payment && (payment.status === 'NONE' || payment.status === 'PENDING_REVIEW') && <p className="claims-muted">Bồi thường: {compensationLabels[payment.status]}</p>}
          {role === 'MANAGER' && payment?.approvedAt && <p className="claims-muted">{[payment.approvedBy, claimDate(payment.approvedAt, true)].filter(Boolean).join(' · ')}</p>}
          {claim.resolutionNote && <div><strong>Kết quả đã thông báo cho khách</strong><p className="claims-text">{claim.resolutionNote}</p></div>}
        </ClaimSection>
        <ClaimCompensation key={claim.updatedAt} claim={claim} role={role} path={path} saved={saved} reload={result.refresh} refreshing={result.refreshing || !!result.error} />
        <ClaimSection title="Lịch sử xử lý">
          <ol className="claims-history">
            {claim.history?.slice().reverse().map((event, index) => <li key={`${event.at}:${index}`}>
              <strong>{claimEventLabels[event.action ?? event.to ?? ''] ?? 'Cập nhật hồ sơ'}</strong>
              <span>{[event.actorName ?? claimRoleLabels[event.role], claimDate(event.at, true)].filter(Boolean).join(' · ')}</span>
              {(event.action === 'DECIDED' || event.action === 'RESOLVED') && event.to && separateStatus[event.to] && <span>{separateStatus[event.to]}</span>}
            </li>)}
            <li><strong>Báo sự cố</strong><span>{claim.customer?.fullName ?? 'Khách hàng'} · {claimDate(claim.createdAt, true)}</span></li>
          </ol>
        </ClaimSection>
      </div>
    </div>}
  </>;
}

function ClaimSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="manager-section claims-card"><h2>{title}</h2>{children}</section>;
}

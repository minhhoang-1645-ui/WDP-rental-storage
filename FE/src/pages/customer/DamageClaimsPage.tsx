import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { RecordTimeline, type RecordEvent } from '../../components/workspace/RecordTimeline';
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
  return <section className={role === 'STAFF' ? 'claims-page staff-operation-list' : 'claims-page'}>
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

  const staff = role === 'STAFF';
  const columns: StaffColumn<Claim>[] = staff ? [
    { key: 'title', label: 'Sự cố', cell: claim => <><strong className="claims-title-link">{claimTitle(claim.description)}</strong><CopyRecordCode value={claim.claimCode} /></> },
    { key: 'customer', label: 'Khách hàng / Kho', cell: claim => <><strong>{claim.customer?.fullName || claim.unitCodeSnapshot}</strong>{claim.customer?.fullName && <small>{claim.unitCodeSnapshot}</small>}</> },
    { key: 'date', label: 'Ngày báo', cell: claim => claimDate(claim.createdAt, true) },
    { key: 'status', label: 'Trạng thái', cell: claim => <ClaimBadge claim={claim} role={role} /> },
  ] : [
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
    <ManagerTaskTable title="Danh sách sự cố hàng hóa" rowDetail={claim => ({ to: to(claim), label: `Xem chi tiết sự cố ${claim.claimCode}` })} columns={columns} items={result.data?.items ?? []} rowKey={claim => claim.id}
      loading={result.loading} refreshing={result.refreshing} error={result.error} retry={result.refresh}
      page={page} limit={limit} total={result.data?.total ?? 0} update={update}
      workspace={staff ? 'staff' : 'manager'}
      emptyTitle={search || stage ? 'Không tìm thấy sự cố phù hợp' : 'Chưa có sự cố hàng hóa'} emptyDescription={search || stage ? 'Thử đổi từ khóa hoặc trạng thái.' : 'Các báo cáo sự cố sẽ xuất hiện tại đây.'}
      toolbar={<div className={staff ? 'staff-operation-claim-filters' : 'claims-filters'}>
        <ManagerTableSearch value={searchInput} onChange={setSearchInput} placeholder={role === 'CUSTOMER' ? 'Tên sự cố, mã kho hoặc mã hồ sơ' : 'Sự cố, khách hàng, mã kho hoặc mã hồ sơ'} />
        <ManagerTableFilter label="Trạng thái" value={stage} options={[[ '', 'Tất cả' ], ...stages[role]]} onChange={value => update('stage', value)} />
      </div>} />
    {creating && <DamageClaimForm close={() => setCreating(false)} saved={id => { onCreated(id); navigate(to({ id })); }} />}
  </>;
}

function ClaimBadge({ claim, role, detail = false }: { claim: Claim; role: ClaimRole; detail?: boolean }) {
  const value = claim.status === 'RESOLVED' || claim.compensation?.status === 'HANDED_OVER' ? 'COMPLETED'
    : claim.compensation?.status === 'AWAITING_HANDOVER' || claim.status === 'REPORTED' ? 'PENDING'
      : role === 'STAFF' && claim.status === 'INVESTIGATING' ? 'IN_PROGRESS' : claim.status;
  const waitingDecision = detail && role === 'STAFF' && claim.status === 'INVESTIGATING' && Boolean(claim.staffFacts);
  return <Status value={value} text={waitingDecision ? 'Chờ quyết định' : claimStatus(claim, role)} />;
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
  const staff = role === 'STAFF';
  const inspection = claim?.history?.findLast(event => event.action === 'INSPECTED');
  return <div className="record-detail-page">
    <ManagerTableBack fallback={back} />
    {claim ? <PageHeader title={['Sự cố hàng hóa', claim.unitCodeSnapshot].filter(Boolean).join(' · ')} status={<ClaimBadge claim={claim} role={role} detail />}
      meta={<>{!staff && <span><Warehouse size={17} aria-hidden="true" />{[claim.unitCodeSnapshot, claim.rentalContract?.contractCode, claim.customer?.fullName].filter(Boolean).join(' · ')}</span>}<CopyRecordCode value={claim.claimCode} /></>}>
      {staff ? <button className="button-secondary" onClick={result.refresh} disabled={result.refreshing || !!result.error}><RefreshCw size={16} aria-hidden="true" />Làm mới</button>
        : <ClaimActions key={claim.updatedAt} claim={claim} role={role} path={path} saved={saved} reload={result.refresh} refreshing={result.refreshing || !!result.error} />}
      <RefreshStatus active={result.refreshing} />
    </PageHeader> : <PageHeader title="Chi tiết sự cố" />}
    <LoadState loading={result.loading} error={detailError} retry={result.refresh} layout="detail" />
    {notice && !detailError && <p className="portal-success" role="status">{notice}</p>}
    {claim && (staff ? <StaffClaimDetail claim={claim} inspectionAction={claim.assignedStaff?.id === identity &&
      <ClaimActions key={claim.updatedAt} claim={claim} role="STAFF" path={path} saved={saved} reload={result.refresh} refreshing={result.refreshing || !!result.error} />}
    /> : <div className="claims-detail-grid">
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
          {claim.affectedItems.length ? <ul className="claims-items-list">{claim.affectedItems.map(item => <li key={item.id}><strong>{item.name}</strong>{item.unit && ` · ${item.unit}`}</li>)}</ul> : <p className="claims-muted">Chưa ghi nhận danh sách hàng bị ảnh hưởng.</p>}
          {claim.evidencePhotos?.map((photo, index) => <a key={index} href={photo} download={'anh-chung-cu-' + (index + 1) + '.jpg'}><img src={photo} alt={'Ảnh chứng cứ ' + (index + 1)} width={120} loading="lazy" /></a>)}
          {claim.evidenceLinks.length > 0 && <ul className="claims-evidence" aria-label="Chứng cứ">{claim.evidenceLinks.map((link, index) => <li key={index}><a href={link} target="_blank" rel="noopener noreferrer">Chứng cứ {index + 1} ↗</a></li>)}</ul>}
        </ClaimSection>
        <ClaimSection title="Kết quả kiểm tra">
          {claim.staffFacts ? <><p className="claims-text">{claim.staffFacts}</p>{(inspection?.actorName || claim.factsRecordedAt) && <Facts items={[
            ...(inspection?.actorName ? [['Người kiểm tra', inspection.actorName] as [string, string]] : []),
            ...(claim.factsRecordedAt ? [['Thời điểm kiểm tra', claimDate(claim.factsRecordedAt, true)] as [string, string]] : []),
          ]} />}</> : <p className="claims-muted">Chưa có kết quả kiểm tra.</p>}
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
        <DetailDisclosure title="Lịch sử xử lý">
          <ol className="claims-history">
            {claim.history?.slice().reverse().map((event, index) => <li key={`${event.at}:${index}`}>
              <strong>{claimEventLabels[event.action ?? event.to ?? ''] ?? 'Cập nhật hồ sơ'}</strong>
              <span>{[event.actorName ?? claimRoleLabels[event.role], claimDate(event.at, true)].filter(Boolean).join(' · ')}</span>
              {(event.action === 'DECIDED' || event.action === 'RESOLVED') && event.to && separateStatus[event.to] && <span>{separateStatus[event.to]}</span>}
            </li>)}
            <li><strong>Báo sự cố</strong><span>{claim.customer?.fullName ?? 'Khách hàng'} · {claimDate(claim.createdAt, true)}</span></li>
          </ol>
        </DetailDisclosure>
      </div>
    </div>)}
  </div>;
}

function ClaimSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="manager-section claims-card"><h2>{title}</h2>{children}</section>;
}

function StaffClaimDetail({ claim, inspectionAction }: { claim: Claim; inspectionAction: ReactNode }) {
  const history = claim.history ?? [];
  const inspector = history.findLast(event => event.action === 'INSPECTED' || (!event.action && event.role === 'STAFF' && event.to === 'INVESTIGATING'));
  const decision = history.findLast(event => event.action === 'DECIDED' || (!event.action && event.role === 'MANAGER' && (event.to === 'APPROVED' || event.to === 'REJECTED')));
  const inspectedAt = claim.factsRecordedAt ?? inspector?.at;
  const decidedAt = decision?.at ?? claim.reviewedAt;
  const approvedAmount = claim.compensation?.approvedCompensationAmount;
  const events: RecordEvent[] = [
    { action: 'Báo sự cố', actor: claim.customer?.fullName, at: claim.createdAt },
    ...history.map(event => ({
      action: claimEventLabels[event.action ?? event.to ?? ''] ?? 'Cập nhật hồ sơ',
      actor: event.actorName || claimRoleLabels[event.role],
      at: event.at,
    })),
  ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));

  return <div className="claims-detail-grid claims-staff-detail">
    <ClaimSection title="Thông tin sự cố">
      <Facts items={[
        ...(claim.customer?.fullName ? [['Khách hàng', claim.customer.fullName] as [string, string]] : []),
        ...(claim.unitCodeSnapshot ? [['Kho liên quan', claim.unitCodeSnapshot] as [string, string]] : []),
        ['Ngày phát hiện', claimDate(claim.discoveredOn)],
        ['Ngày báo', claimDate(claim.createdAt, true)],
        ...(claim.estimatedValue != null ? [['Giá trị khách ước tính', money(claim.estimatedValue)] as [string, string]] : []),
      ]} />
      <div><strong>Mô tả sự cố</strong><p className="claims-text">{claim.description}</p></div>
      {claim.evidenceLinks.length > 0 && <ul className="claims-evidence" aria-label="Chứng cứ">{claim.evidenceLinks.map((link, index) =>
        <li key={index}><a href={link} target="_blank" rel="noopener noreferrer">Chứng cứ {index + 1} ↗</a></li>)}</ul>}
    </ClaimSection>
    <ClaimSection title="Quyết định của quản lý">
      {claim.decision ? <>
        <Status value={claim.decision} text={claim.decision === 'APPROVED' ? 'Chấp thuận hướng xử lý' : 'Từ chối đề nghị'} />
        {claim.decisionReason && <p className="claims-text">{claim.decisionReason}</p>}
        {(decision?.actorName || decidedAt || approvedAmount != null) && <Facts items={[
          ...(decision?.actorName ? [['Người quyết định', decision.actorName] as [string, string]] : []),
          ...(decidedAt ? [['Thời điểm quyết định', claimDate(decidedAt, true)] as [string, string]] : []),
          ...(approvedAmount != null ? [['Bồi thường được duyệt', money(approvedAmount)] as [string, string]] : []),
        ]} />}
      </> : <p className="claims-muted">Chờ quyết định xử lý.</p>}
      {claim.resolutionNote && <div><strong>Kết quả đã thông báo cho khách</strong><p className="claims-text">{claim.resolutionNote}</p></div>}
    </ClaimSection>
    <ClaimSection title="Kết quả kiểm tra">
      {claim.staffFacts ? <>
        {(inspector?.actorName || inspectedAt) && <Facts items={[
          ...(inspector?.actorName ? [['Người kiểm tra', inspector.actorName] as [string, string]] : []),
          ...(inspectedAt ? [['Thời điểm kiểm tra', claimDate(inspectedAt, true)] as [string, string]] : []),
        ]} />}
        <div><strong>Ghi nhận của nhân viên</strong><p className="claims-text">{claim.staffFacts}</p></div>
      </> : <p className="claims-muted">Chưa có kết quả kiểm tra.</p>}
      {inspectionAction}
    </ClaimSection>
    <ClaimSection title="Hàng bị ảnh hưởng">
      {claim.affectedItems.length ? <ul className="claims-items-list">{claim.affectedItems.map(item =>
        <li key={item.id}><strong>{item.name}</strong>{item.itemCode && ` · ${item.itemCode}`}{item.unit && ` · ${item.unit}`}</li>
      )}</ul> : <p className="claims-muted">Chưa ghi nhận danh sách hàng bị ảnh hưởng.</p>}
    </ClaimSection>
    <div className="claims-staff-references">
      {claim.rentalContract?.contractCode && <DetailDisclosure title="Hồ sơ liên quan">
        <Facts items={[[ 'Hợp đồng thuê kho', claim.rentalContract.contractCode ]]} />
      </DetailDisclosure>}
      <DetailDisclosure title="Lịch sử xử lý"><RecordTimeline events={events} /></DetailDisclosure>
    </div>
  </div>;
}

import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CircleAlert, FileText, History, Info, Layers, Mail, MessageSquare, Phone, Printer, RefreshCw, User, Users, Warehouse } from 'lucide-react';
import { OperationsLink as Link } from '../../components/manager/OperationsLink';
import { Modal, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { StaffPicker } from '../../components/manager/StaffPicker';
import { useAuth } from '../../auth/auth-context';
import { TransferDestinationPicker } from '../../components/manager/TransferDestinationPicker';
import { code, customer, date, first, label, object, rows, transferHandoverSchedule, type Row } from '../../components/manager/portal-data';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { ApiError } from '../../services/api';
import { hasDraft } from '../../services/live-events';
import { allPages, mutate } from '../../services/portal';
import { useApiResource } from '../../services/useApiResource';
import { useCurrentTime } from '../../hooks/useCurrentTime';
import { vietnamLocalMinute } from '../../utils/handover';
import { transferDestinationPath, transferLocation } from '../../utils/transfer-request';
import { ManagerActions } from './ManagerActions';
import './manager-transfer-detail.css';

type TransferProps = {
  row: Row; id: string; returnPath: string; canProcess: boolean; refresh: () => void;
  refreshing: boolean; notice: string; onNotice: (message: string) => void; children?: ReactNode;
};

type Fact = [typeof User, string, ReactNode];
function RequestFacts({ items }: { items: Fact[] }) {
  return <dl className="transfer-facts">{items.map(([Icon, title, value]) => <div key={title}>
    <dt><Icon size={16} aria-hidden="true" />{title}</dt><dd>{value || 'Chưa cập nhật'}</dd>
  </div>)}</dl>;
}

export function ManagerTransferDetail({ row, id, returnPath, canProcess, refresh, refreshing, notice, onNotice, children }: TransferProps) {
  const { user } = useAuth();
  const [selection, setSelection] = useState<Row | null>(null);
  const [ready, setReady] = useState(false);
  const [reviewHash, setReviewHash] = useState('');
  const [staff, setStaff] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | ''>('');
  const [error, setError] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [listVersion, setListVersion] = useState(0);
  const lock = useRef(false);
  const source = object(row.fromUnit);
  const savedUnit = object(row.toUnit);
  const requested = row.status === 'REQUESTED';
  const editable = requested && canProcess;
  const clock = useCurrentTime(editable);
  const target = requested ? selection : savedUnit;
  const targetId = first(target ?? {}, 'id');
  const targetCode = first(target ?? {}, 'unitCode');
  const storedLocation = transferLocation(savedUnit);
  const unitDetail = useApiResource<Row>(!requested && targetId && !storedLocation ? '/manager/units/' + encodeURIComponent(targetId) : null, user?.id);
  const location = requested ? transferLocation(selection ?? {}) : storedLocation || transferLocation(unitDetail.data ?? {});
  const recordCode = code(row);
  const person = customer(row);
  const phone = first(person, 'phone', 'phoneNumber'), email = first(person, 'email');
  const schedule = transferHandoverSchedule(row);
  const proposalEnd = Date.parse(first(row, 'transferRequestedSchedule.endAt'));
  const past = requested && proposalEnd <= clock;
  const proposalStart = Date.parse(first(row, 'transferRequestedSchedule.startAt'));
  const proposalDay = Number.isFinite(proposalStart) ? vietnamLocalMinute(proposalStart).slice(0, 10) : '';
  const checkedFrom = first(selection ?? {}, 'checkedFrom'), checkedUntil = first(selection ?? {}, 'checkedUntil');
  const outsideWindow = proposalDay && checkedFrom && checkedUntil && (proposalDay < checkedFrom || proposalDay >= checkedUntil);
  const assigned = first(row, 'assignedStaff.id');
  const needStaff = Boolean(reviewHash && !staff && !assigned);
  const canApprove = editable && Boolean(targetId) && ready && !needStaff && !busy && !refreshing;
  const rejection = first(row, 'rejectionReason');
  const leaseStart = first(row, 'reservation.startDate', 'contract.startDate');
  const reservationEnd = first(row, 'reservation.endDate');
  const contractEnd = first(row, 'contract.endDate');
  const problemRows = rows(object(row.handoverReport).problems);
  const reviews = rows(object(row.handoverReport).problemReviewHistory);
  const canceled = reviews.some(review => review.decision === 'CANCEL');
  const directlyRejected = row.status === 'REJECTED' && !canceled;
  const history = [
    { date: first(row, 'createdAt'), actor: first(row, 'requestedBy.fullName'), action: 'Gửi yêu cầu', status: 'Chờ duyệt', note: first(row, 'requestDescription') },
    { date: first(row, 'approvedAt'), actor: first(row, 'approvedBy.fullName'), action: directlyRejected ? 'Từ chối chuyển kho' : 'Duyệt chuyển kho', status: directlyRejected ? 'Đã từ chối' : 'Đã duyệt', note: directlyRejected ? rejection : '' },
    { date: first(row, 'commercial.acceptedAt'), actor: first(row, 'commercial.acceptanceName'), action: 'Ký phụ lục', status: 'Đã ký', note: '' },
    { date: first(row, 'completedAt'), actor: first(row, 'completedBy.fullName'), action: 'Hoàn tất bàn giao', status: 'Đã hoàn tất', note: first(row, 'handoverReport.note') },
    ...problemRows.map(problem => ({ date: first(problem, 'reportedAt'), actor: first(problem, 'staffName'), action: 'Báo vướng mắc', status: '', note: first(problem, 'note') })),
    ...reviews.map(review => ({ date: first(review, 'reviewedAt'), actor: first(review, 'managerName'), action: review.decision === 'CANCEL' ? 'Hủy chuyển kho' : 'Cho tiếp tục bàn giao', status: '', note: first(review, 'note') })),
  ].filter(event => Number.isFinite(Date.parse(event.date))).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  function choose(unit: Row | null) {
    if (first(unit ?? {}, 'id') !== first(selection ?? {}, 'id')) {
      setReady(false);
      setReviewHash('');
    }
    setSelection(unit);
  }
  function dismissReject() {
    setRejectOpen(false);
    setReason('');
    setRejectError('');
  }

  async function submit(action: 'approve' | 'reject') {
    if (lock.current || !editable || (action === 'approve' ? !canApprove : reason.trim().length < 3 || reason.trim().length > 2000)) return;
    lock.current = true;
    setBusy(action);
    setError('');
    setRejectError('');
    try {
      if (action === 'approve') {
        const latest = await allPages(transferDestinationPath(id));
        const candidate = latest.items.find(unit => first(unit, 'id') === targetId);
        if (!candidate || candidate.eligible !== true) {
          choose(null);
          setListVersion(version => version + 1);
          setError(first(candidate ?? {}, 'unavailableReason') || 'Kho đích không còn khả dụng. Vui lòng chọn lại.');
          return;
        }
      }
      await mutate('/manager/transfers/' + encodeURIComponent(id) + '/' + action, 'POST', action === 'reject'
        ? { reason: reason.trim() }
        : { toStorageUnitId: targetId, staffUserId: staff, ...(reviewHash ? { commercialReviewHash: reviewHash } : {}) });
      if (action === 'reject') dismissReject();
      choose(null);
      onNotice(action === 'approve' ? 'Đã duyệt hồ sơ chuyển kho.' : 'Đã từ chối yêu cầu chuyển kho.');
      refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Không thể xử lý hồ sơ.';
      if (action === 'reject') setRejectError(message);
      else {
        setError(message);
        if (caught instanceof ApiError && [404, 409].includes(caught.status)) {
          choose(null);
          setListVersion(version => version + 1);
        }
      }
    } finally {
      lock.current = false;
      setBusy('');
    }
  }

  const pendingMessage = !targetId ? 'Chưa chọn kho đích' : !ready ? 'Đang chờ kiểm tra kho đích' : needStaff ? 'Chưa chọn nhân viên phụ trách' : '';
  const reservationId = first(row, 'reservation.id'), contractId = first(row, 'contract.id');
  const fileLink = (kind: string, recordId: string, title: string) => recordId
    ? <Link to={'/manager/operations/' + kind + '/' + encodeURIComponent(recordId)}>{title || recordId}</Link> : title;
  return <section className="manager-transfer-dashboard">
    <header className="transfer-page-header">
      <div><Link className="transfer-back" to={returnPath}><ArrowLeft size={16} /> Chuyển kho</Link>
        <div className="transfer-title"><h1>Chi tiết chuyển kho</h1><Status value={row.status}
          text={requested ? 'Chờ duyệt' : row.status === 'APPROVED' && row.commercial && !first(row, 'commercial.acceptedAt') ? 'Chờ ký phụ lục' : undefined} /></div>
        <div className="transfer-code"><CopyRecordCode value={recordCode} /></div>
      </div>
      <div className="transfer-header-actions"><button className="button-secondary" onClick={() => window.print()}><Printer size={16} /> In hồ sơ</button>
        <button className="button-secondary" aria-label="Làm mới hồ sơ" disabled={Boolean(busy) || refreshing} onClick={() => {
          if (hasDraft() || selection || rejectOpen || staff) { onNotice('Bạn đang nhập nội dung. Hãy lưu thao tác trước khi làm mới hồ sơ.'); return; }
          refresh();
        }}><RefreshCw size={16} /></button><RefreshStatus active={refreshing} /></div>
    </header>
    {notice && <p className="portal-success" role="status">{notice}</p>}
    <div className="transfer-overview transfer-panel">
      <div className="transfer-unit"><span className="transfer-unit-icon"><Warehouse size={25} /></span><div><small>Kho hiện tại (nguồn)</small>
        <p><strong>{first(source, 'id') ? <Link to={'/manager/units/' + encodeURIComponent(first(source, 'id'))}>{first(source, 'unitCode')}</Link> : first(source, 'unitCode') || 'Chưa cập nhật'}</strong>{[first(source, 'storageType.name'), first(source, 'facility.name', 'storageType.facility.name')].filter(Boolean).map(value => <span key={value}>{value}</span>)}</p></div></div>
      <ArrowRight className="transfer-direction" size={25} aria-hidden="true" />
      <div className="transfer-unit transfer-target" data-selected={Boolean(targetCode)}><span className="transfer-unit-icon"><Warehouse size={25} /></span><div><small>Kho đích {targetCode && (requested ? '· Đang chọn' : '· Đã xác nhận')}</small>
        <p><strong>{targetCode || 'Chưa chọn kho đích'}</strong>{targetCode && first(target ?? {}, 'storageType.name') && <span>{first(target ?? {}, 'storageType.name')}</span>}</p>
        {targetCode && (location ? <small>{location}</small> : !requested && <Link to={'/manager/units/' + encodeURIComponent(targetId)}>Xem vị trí kho</Link>)}</div></div>
      {editable && <p className="transfer-scope"><Info size={17} /> Chỉ chọn kho cùng loại tại cơ sở hiện tại.</p>}
    </div>
    <div className="transfer-grid">
      <div className="transfer-panel transfer-request">
        <h2><User size={20} /> Thông tin yêu cầu</h2>
        <RequestFacts items={[[User, 'Khách hàng', first(person, 'fullName', 'name')], [Phone, 'Điện thoại', phone && <a key="phone" href={'tel:' + phone}>{phone}</a>], [Mail, 'Email', email && <a key="email" href={'mailto:' + email}>{email}</a>]]} />
        <RequestFacts items={[
          [Layers, 'Đặt kho liên quan', fileLink('reservations', reservationId, first(row, 'reservation.reference'))],
          [FileText, 'Hợp đồng', fileLink('contracts', contractId, first(row, 'contract.contractCode'))],
        ]} />
        <RequestFacts items={[
          [CalendarDays, 'Thời gian thuê', leaseStart && (contractEnd || reservationEnd) && (date(leaseStart) + ' – ' + date(reservationEnd || contractEnd))],
          ...(contractEnd && reservationEnd && contractEnd !== reservationEnd ? [[CalendarDays, 'Hạn thuê còn lại đến', date(contractEnd)] as Fact] : []),
          [CircleAlert, 'Lý do chuyển', row.reason ? label(row.reason) : ''],
          [CalendarDays, 'Bàn giao theo yêu cầu', schedule],
          [MessageSquare, 'Ghi chú', first(row, 'requestDescription', 'customerNotes', 'note')],
          ...(assigned ? [[Users, 'Nhân viên thực hiện', first(row, 'assignedStaff.fullName')] as Fact] : []),
        ]} />
        {(past || outsideWindow) && <p className="transfer-warning" role="status"><CircleAlert size={16} />{past ? 'Lịch bàn giao khách đề xuất đã qua.' : 'Lịch bàn giao khách đề xuất nằm ngoài khoảng đã kiểm tra của kho đang chọn.'}</p>}
        <DetailDisclosure title={<><History size={17} /> Lịch sử xử lý</>}>
          {history.length ? <ol className="transfer-history">{history.map((event, index) => <li key={event.date + ':' + index}>
            <strong>{event.action}</strong><small><time dateTime={event.date}>{date(event.date, true)}</time>{event.actor && ' · ' + event.actor}{event.status && ' · ' + event.status}</small>
            {event.note && <p>{event.note}</p>}</li>)}</ol> : <p>Chưa có lịch sử xử lý.</p>}
        </DetailDisclosure>
      </div>
      <div className="transfer-panel transfer-processing">
        {editable ? <>
          <TransferDestinationPicker key={listVersion} transferId={id} source={source} value={targetId} onChange={choose} onReady={setReady} onReviewed={setReviewHash} disabled={Boolean(busy)} />
          <section className="transfer-staff"><h2><Users size={20} /> Nhân viên thực hiện</h2>
            <StaffPicker task={{ kind: 'transfers', id }} dropdown value={staff} onChange={setStaff} disabled={Boolean(busy)} />
            <p><Info size={16} />{reviewHash ? 'Hồ sơ có phụ lục cần người phụ trách.' : 'Chuyển kho nội bộ có thể đưa vào hàng chờ phân công.'}</p>
          </section>
        </> : <><h2><Info size={20} /> Kết quả xử lý</h2>
          {rejection && <p className="transfer-warning">{canceled ? 'Lý do hủy' : 'Lý do từ chối'}: {rejection}</p>}
          {row.commercial && <p>{first(row, 'commercial.acceptedAt') ? 'Khách đã ký phụ lục.' : 'Chờ khách ký phụ lục.'}</p>}
          {row.commercialPayment && <p>{rows(object(row.commercialPayment).dueInvoices).length ? 'Khách còn hóa đơn đến hạn cần thanh toán trước khi nhân viên nhận việc.'
            : object(row.commercialPayment).pendingRenewalInvoice ? 'Kỳ gia hạn đang chờ phát hành hoặc đối soát hóa đơn.' : 'Không có hóa đơn đến hạn chưa thanh toán.'}</p>}
          {canProcess && <ManagerActions resource="transfers" row={row} id={id} refresh={refresh} onSuccess={onNotice} />}
          {children}
        </>}
      </div>
    </div>
    {editable && <footer className="transfer-action-bar">
      <div>{error && <p className="transfer-action-error" role="alert">{error}</p>}
        <div className="transfer-action-context"><Info size={17} />{targetCode && <strong>{first(source, 'unitCode')} → {targetCode}</strong>} {pendingMessage}</div></div>
      <div className="transfer-action-buttons"><button className="button-secondary transfer-reject" disabled={Boolean(busy) || refreshing} onClick={() => setRejectOpen(true)}>Từ chối chuyển kho</button>
        <button className="button-primary" disabled={!canApprove} onClick={() => void submit('approve')}>{busy === 'approve' ? 'Đang kiểm tra và duyệt…' : staff || assigned ? 'Duyệt và phân công' : 'Duyệt vào hàng chờ'} <ArrowRight size={16} /></button></div>
    </footer>}
    {editable && rejectOpen && <Modal title="Từ chối yêu cầu chuyển kho" subtitle={recordCode} onClose={dismissReject} busy={Boolean(busy)}>
      <form className="portal-form" onSubmit={event => { event.preventDefault(); void submit('reject'); }}>
        <label className="field-label">Lý do từ chối<textarea rows={3} minLength={3} maxLength={2000} required disabled={Boolean(busy)} value={reason} onChange={event => setReason(event.target.value)} /></label>
        {rejectError && <p role="alert">{rejectError}</p>}
        <div className="transfer-action-buttons"><button type="button" className="button-secondary" disabled={Boolean(busy)} onClick={dismissReject}>Hủy</button><button className="button-primary transfer-reject-confirm" disabled={Boolean(busy) || reason.trim().length < 3}>{busy ? 'Đang lưu…' : 'Xác nhận từ chối'}</button></div>
      </form>
    </Modal>}
  </section>;
}

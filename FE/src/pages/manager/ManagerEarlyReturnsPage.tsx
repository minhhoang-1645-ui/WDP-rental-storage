import { useListPagination } from '../../components/workspace/useListPagination';
import { EarlyReturnFinanceFields } from '../../components/manager/EarlyReturnFinanceReview';
import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { ManagerTableBack } from '../../components/manager/ManagerTaskTable';
import { useManagerListRecord } from '../../components/manager/useManagerListRecord';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import { first, date, money, rows, type Row } from '../../components/manager/portal-data';
import { Empty, Facts, LoadState, PageHeader, RefreshStatus } from '../../components/manager/PortalUi';
import { DetailSkeleton } from '../../components/LoadingSkeleton';
import { EARLY_RETURN_PAYMENT_MESSAGE, earlyReturnManagerNote } from '../../utils/early-return';

export function ManagerEarlyReturnsPage() {
  const [params] = useSearchParams();
  const record = params.get('record');
  return record ? <EarlyReturnRecord id={record} /> : <EarlyReturnList />;
}

function EarlyReturnRecord({ id }: { id: string }) {
  const { user } = useAuth();
  const data = useManagerListRecord<Row & { id: string }>('/manager/early-return-requests', id, user?.id);
  return <section>
    <PageHeader title="Đề nghị trả trước hạn"><button className="button-secondary" onClick={data.refresh}>Làm mới đề nghị</button></PageHeader>
    <ManagerTableBack fallback="/manager/early-returns" />
    <RefreshStatus active={data.refreshing} />
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} placeholder={<DetailSkeleton single form heading={false} />} />
    {data.data ? <EarlyReturnReview key={`${id}:${first(data.data, 'decision')}`} item={data.data} refresh={data.refresh} /> :
      !data.loading && !data.error && <Empty title="Không tìm thấy đề nghị" />}
  </section>;
}

function EarlyReturnList() {
  const { user } = useAuth();
  const data = usePaginatedResource<Row>('/manager/early-return-requests?limit=100', user?.id ?? '', true);
  const [params, setParams] = useSearchParams();
  const showHistory = params.get('history') === '1';
  const { items, pagination } = useListPagination((data.data?.items ?? []).filter(item => showHistory || !item.decision || item.facilityFaultReviewAvailable === true && !item.facilityFaultDecision || Boolean(item.closeout && !first(item, 'rentRefund.approvedAt')) || Number(first(item, 'closeout.refundAmount')) > 0 && !first(item, 'rentRefund.refundedAt')));
  return <section><PageHeader title="Đề nghị trả trước hạn" description="Xem đề nghị, theo dõi bàn giao và duyệt quyết toán."><button className="button-secondary" disabled={data.loading} onClick={data.refresh}>Làm mới đề nghị</button></PageHeader>
    <label className="portal-checkbox"><input type="checkbox" checked={showHistory} onChange={event => setParams(previous => {
      const next = new URLSearchParams(previous);
      if (event.target.checked) next.set('history', '1');
      else next.delete('history');
      next.delete('page');
      return next;
    }, { replace: true })} />Xem cả đề nghị đã quyết định</label>
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {!data.loading && !data.error && (!items.length ? <Empty title="Không có đề nghị phù hợp" /> : items.map(item => <EarlyReturnReview key={`${first(item, 'id')}:${first(item, 'decision')}`} item={item} refresh={data.refresh} />))}
    {!data.loading && !data.error && pagination}
  </section>;
}
function EarlyReturnReview({ item, refresh }: { item: Row; refresh: () => void }) {
  const [decision, setDecision] = useState('APPROVED');
  const [note, setNote] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [faultEvidence, setFaultEvidence] = useState('');
  const [reference, setReference] = useState('');
  const [transferredAt, setTransferredAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const resolutionNote = first(item, 'resolutionNote');
  const managerNote = item.decision === 'APPROVED' ? earlyReturnManagerNote(resolutionNote) : resolutionNote;
  const approvedAt = first(item, 'rentRefund.approvedAt');
  const refundedAt = first(item, 'rentRefund.refundedAt');
  const refundAmount = Number(first(item, 'closeout.refundAmount'));
  const hasCloseout = Boolean(first(item, 'closeout.appliedAt'));
  const run = async (path: string, body: Row) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate('/manager/early-return-requests/' + path, 'POST', body, true);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa lưu được thay đổi.');
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(encodeURIComponent(first(item, 'id')) + '/decision', {
      decision, note: note.trim(), financialReviewConfirmed: reviewed,
      reviewedEndDate: first(item, 'reservation.effectiveEndDate'),
      reviewedOutstandingAmount: Number(first(item, 'financialSummary.outstandingAmount')),
      reviewedPaidAmount: Number(first(item, 'financialSummary.paidAmount')),
    });
  };
  const settlementPath = 'returns/' + encodeURIComponent(first(item, 'returnId'));
  return <article className="manager-section early-return-review">
    <h2>{first(item, 'customer.fullName')} · {first(item, 'supportCode')}</h2>
    <Facts items={[
      ['Liên hệ', first(item, 'customer.phone', 'customer.email')],
      ['Yêu cầu thuê', first(item, 'reservation.reference')],
      ['Kho đề nghị trả', rows(item.contracts).map(contract => first(contract, 'unitCode') + ' (' + first(contract, 'contractCode') + ')').join(', ')],
      ['Hạn hợp đồng', date(first(item, 'reservation.effectiveEndDate'))],
      ['Ngày khách muốn trả', first(item, 'financialReview.requestedDate') ? date(first(item, 'financialReview.requestedDate')) : 'Chưa ghi'],
      ['Lý do trả sớm', first(item, 'description')],
    ]} />
    {Boolean(item.decision) && <div className="portal-success"><strong>{item.decision === 'APPROVED' ? 'Đã chấp thuận trả trước hạn' : 'Đã từ chối đề nghị'}</strong>
      {item.decision === 'APPROVED' && <p>{EARLY_RETURN_PAYMENT_MESSAGE}</p>}
      {managerNote && <p>{managerNote}</p>}
      <small>{first(item, 'resolvedBy.fullName')} · {date(item.resolvedAt, true)}</small>
      {Boolean(item.physicallyReturnedAt) && <p>Đã nhận lại kho {date(item.physicallyReturnedAt, true)}.</p>}
    </div>}
    {item.decision !== 'REJECTED' && <EarlyReturnFinanceFields item={item} />}
    {!item.decision && <form className="portal-form" onSubmit={submit}><fieldset disabled={busy}>
      <label className="field-label">Quyết định trả sớm<select value={decision} onChange={event => setDecision(event.target.value)}>
        <option value="APPROVED">Cho phép trả kho trước hạn</option><option value="REJECTED">Từ chối đề nghị</option>
      </select></label>
      <label className="field-label">Ghi chú quyết định<textarea required minLength={3} maxLength={3000} rows={3}
        value={note} onChange={event => setNote(event.target.value)} /></label>
      {decision === 'APPROVED' && <label className="portal-checkbox"><input type="checkbox" checked={reviewed}
        onChange={event => setReviewed(event.target.checked)} />Tôi đã kiểm tra hóa đơn, tiền cọc và điều kiện trả kho</label>}
      <button className="button-primary" disabled={busy || note.trim().length < 3 || decision === 'APPROVED' && !reviewed}>
        {decision === 'APPROVED' ? 'Cho phép trả kho trước hạn' : 'Từ chối đề nghị'}
      </button>
    </fieldset></form>}
    {item.facilityFaultReviewAvailable === true && <section className="early-return-finance-review">
      <h3>Xác minh lỗi cơ sở</h3>
      <p>Nhân viên đã ghi nhận lỗi cơ sở. Xác minh để quyết định có giảm tiền thuê cho số ngày chưa sử dụng trong kỳ hiện tại.</p>
      {Boolean(item.facilityFaultDecision) && <p>{item.facilityFaultDecision === 'APPROVED' ? 'Đã duyệt giảm tiền' : 'Đã giữ cách tính thông thường'}</p>}
      <label className="field-label">Mã hồ sơ hoặc ghi chú xác minh<input maxLength={200} value={faultEvidence} onChange={event => setFaultEvidence(event.target.value)} /></label>
      <div className="portal-actions">
        <button className="button-primary" disabled={busy || !faultEvidence.trim()} onClick={() => void run(settlementPath + '/facility-review', { approved: true, reference: faultEvidence })}>Duyệt giảm tiền kỳ hiện tại</button>
        <button className="button-secondary" disabled={busy || !faultEvidence.trim()} onClick={() => void run(settlementPath + '/facility-review', { approved: false, reference: faultEvidence })}>Giữ cách tính thông thường</button>
      </div>
    </section>}
    {hasCloseout && <section className="early-return-finance-review">
      <h3>Duyệt quyết toán và hoàn tiền thuê</h3>
      {!approvedAt ? <button className="button-primary" disabled={busy}
        onClick={() => void run(settlementPath + '/settlement-approval', { amount: refundAmount })}>Duyệt quyết toán</button> :
        <p>Đã duyệt quyết toán {date(approvedAt, true)}.</p>}
      {refundedAt ? <p>Đã chuyển {money(refundAmount)} · {date(refundedAt, true)} · {first(item, 'rentRefund.reference')}</p> :
        approvedAt && refundAmount > 0 && <form className="portal-form" onSubmit={event => {
          event.preventDefault();
          void run(settlementPath + '/refund-confirmation', { amount: refundAmount, reference, transferredAt: new Date(transferredAt).toISOString() });
        }}>
          <label className="field-label">Mã chuyển khoản<input required maxLength={160} value={reference} onChange={event => setReference(event.target.value)} /></label>
          <label className="field-label">Thời điểm chuyển khoản<input required type="datetime-local" step="1" value={transferredAt} onChange={event => setTransferredAt(event.target.value)} /></label>
          <button className="button-primary" disabled={busy}>Xác nhận đã chuyển {money(refundAmount)}</button>
        </form>}
    </section>}
    {error && <p role="alert">{error}</p>}
  </article>;
}

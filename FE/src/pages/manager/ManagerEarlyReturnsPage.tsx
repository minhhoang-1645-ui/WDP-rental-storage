import { useListPagination } from '../../components/workspace/useListPagination';
import { EarlyReturnFinanceFields, EarlyReturnFinanceReview } from '../../components/manager/EarlyReturnFinanceReview';
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
  const { items, pagination } = useListPagination((data.data?.items ?? []).filter(item => showHistory || !item.decision));
  return <section><PageHeader title="Đề nghị trả trước hạn" description="Duyệt thời điểm trả sớm. Khách vẫn cần trả đủ các hóa đơn còn hiệu lực."><button className="button-secondary" disabled={data.loading} onClick={data.refresh}>Làm mới đề nghị</button></PageHeader>
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
  const [decision, setDecision] = useState('APPROVED'), [note, setNote] = useState(''), [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await mutate(`/manager/early-return-requests/${encodeURIComponent(first(item, 'id'))}/decision`, 'POST', { decision, note: note.trim(), financialReviewConfirmed: reviewed, reviewedEndDate: first(item, 'reservation.effectiveEndDate'), reviewedOutstandingAmount: Number(first(item, 'financialSummary.outstandingAmount')), reviewedPaidAmount: Number(first(item, 'financialSummary.paidAmount')) }, true); refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa lưu được quyết định.'); } finally { setBusy(false); lock.current = false; } };
  return <article className="manager-section early-return-review"><h2>{first(item, 'customer.fullName')} · {first(item, 'supportCode')}</h2><Facts items={[
    ['Liên hệ', first(item, 'customer.phone', 'customer.email')], ['Yêu cầu thuê', first(item, 'reservation.reference')], ['Kho đề nghị trả', rows(item.contracts).map(contract => `${first(contract, 'unitCode')} (${first(contract, 'contractCode')})`).join(', ')], ['Hạn hợp đồng', date(first(item, 'reservation.effectiveEndDate'))], ['Lý do trả sớm', first(item, 'description')], ['Công nợ cả đơn', money(Number(first(item, 'financialSummary.outstandingAmount')))], ['Đã thu cả đơn', money(Number(first(item, 'financialSummary.paidAmount')))], ['Cọc đã lập hóa đơn của đơn', money(Number(first(item, 'financialSummary.invoicedDeposit')))],
  ]} />{item.decision ? <div className="portal-success"><strong>{item.decision === 'APPROVED' ? 'Đã chấp thuận trả trước hạn' : 'Đã từ chối đề nghị'}</strong><p>{first(item, 'resolutionNote')}</p><small>{first(item, 'resolvedBy.fullName')} · {date(item.resolvedAt, true)}</small></div> : <form className="portal-form" onSubmit={submit}><fieldset disabled={busy}><label className="field-label">Quyết định trả sớm<select value={decision} onChange={event => setDecision(event.target.value)}><option value="APPROVED">Chấp thuận trả trước hạn</option><option value="REJECTED">Chưa chấp thuận</option></select></label>{decision === 'APPROVED' && <EarlyReturnFinanceFields item={item} />}<label className="field-label">Điều kiện hoặc lý do trả sớm<textarea required minLength={3} maxLength={3000} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Ghi rõ kết quả đối chiếu và điều kiện để khách biết trước khi trả." /></label><label className="portal-checkbox"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Tôi đã kiểm tra hóa đơn, tiền cọc và điều kiện trả kho</label>{error && <p role="alert">{error}</p>}<button className="button-primary" disabled={busy || !note.trim() || decision === 'APPROVED' && !reviewed}>{busy ? 'Đang lưu…' : 'Lưu quyết định trả sớm'}</button></fieldset></form>}{item.decision === 'APPROVED' && <EarlyReturnFinanceReview item={item} />}</article>;
}

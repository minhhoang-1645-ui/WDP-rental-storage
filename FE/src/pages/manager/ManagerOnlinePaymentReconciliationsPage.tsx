import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import { moneyLabel, formatPortalDate } from '../../components/customer/CustomerPortalHelpers';
import { Empty, LoadState, PageHeader, Pagination, Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { internalPageSize } from '../../utils/internal-pagination';

type Reconciliation = {
  id: string; reconciliationCode: string; status: 'PENDING_REVIEW' | 'REFUND_REQUIRED' | 'RECONCILED'; reason: string; amount: number;
  providerTransactionId: string | null; createdAt: string; reviewedAt: string | null; resolutionNote: string | null;
  transaction: { merchantOrderRef: string; invoice: { invoiceCode: string; status: string; reservation: { reference: string; customer: { fullName: string; email: string } } } };
};
const labels = { PENDING_REVIEW: 'Chờ đối soát', REFUND_REQUIRED: 'Cần hoàn tiền', RECONCILED: 'Đã đối soát' };

export function ManagerOnlinePaymentReconciliationsPage() {
  const resource = usePaginatedResource<Reconciliation>('/manager/online-payment-reconciliations?limit=100', 'manager-online-payment-reconciliations', true);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('record');
  const status = params.get('status') ?? '';
  const items = (resource.data?.items ?? []).filter(item => selectedId ? item.id === selectedId : !status || item.status === status);
  const limit = internalPageSize(params);
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('page')) || 1)), Math.max(1, Math.ceil(items.length / limit)));
  function changeFilter(key: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  }
  const [working, setWorking] = useState('');
  const [actionError, setActionError] = useState('');
  const resolve = async (item: Reconciliation, resolution: 'REFUND_REQUIRED' | 'RECONCILED') => {
    const refundReference = item.status === 'REFUND_REQUIRED' ? window.prompt('Chỉ ghi nhận sau khi đã hoàn tiền thực tế. Nhập mã giao dịch hoàn tiền:')?.trim() : undefined;
    if (item.status === 'REFUND_REQUIRED' && !refundReference) return;
    const resolutionNote = window.prompt(resolution === 'REFUND_REQUIRED' ? 'Ghi chú yêu cầu hoàn tiền:' : 'Căn cứ và ghi chú đã đối soát:');
    if (!resolutionNote?.trim()) return;
    setWorking(item.id); setActionError('');
    try { await mutate(`/manager/online-payment-reconciliations/${encodeURIComponent(item.id)}/resolve`, 'POST', { resolution, resolutionNote: resolutionNote.trim(), ...(refundReference ? { refundReference, refundConfirmed: true } : {}) }); resource.refresh(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Không lưu được kết quả đối soát. Vui lòng thử lại.'); }
    finally { setWorking(''); }
  };
  return <section className="manager-page">
    <PageHeader title="Đối soát VNPay" description="Giao dịch thành công sau khi hóa đơn hoặc đơn đặt kho hết hiệu lực. Hệ thống không tự kích hoạt lại kho.">
      <button className="button-secondary" type="button" onClick={resource.refresh} disabled={resource.loading || resource.refreshing}><RefreshCw size={16} /> Làm mới</button>
    </PageHeader>
    {actionError && <p className="booking-alert is-error" role="alert">{actionError}</p>}
    {selectedId ? <Link className="button-secondary manager-back-to-list" to="/manager/online-payment-reconciliations">Xem tất cả hồ sơ đối soát</Link> : <div className="portal-toolbar">
      <label className="field-label">Trạng thái<select value={status} onChange={event => changeFilter('status', event.target.value)}>
        <option value="">Tất cả</option>
        {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>}
    <LoadState loading={resource.loading} error={resource.error} retry={resource.refresh} />
    {resource.data && !resource.error && (!items.length ? <Empty title="Chưa có hồ sơ phù hợp" /> : <>
      <div className="manager-table-wrap"><table className="manager-table">
        <thead><tr><th>Khách hàng / hóa đơn</th><th>Giao dịch</th><th>Số tiền</th><th>Lý do</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{items.slice((page - 1) * limit, page * limit).map(item => <tr key={item.id}>
          <td><strong>{item.transaction.invoice.reservation.customer.fullName}</strong><small>{item.transaction.invoice.invoiceCode} · {item.transaction.invoice.reservation.reference}</small></td>
          <td><CopyRecordCode value={item.reconciliationCode} /><small>{item.providerTransactionId || item.transaction.merchantOrderRef}</small><small>{formatPortalDate(item.createdAt, true)}</small></td>
          <td><strong>{moneyLabel(item.amount)}</strong></td>
          <td>{item.reason}{item.resolutionNote && <small>{item.resolutionNote}</small>}</td>
          <td><Status value={item.status} text={labels[item.status]} /></td>
          <td>{item.status === 'PENDING_REVIEW' ? <div className="manager-inline-actions"><button type="button" className="button-secondary" disabled={working === item.id} onClick={() => resolve(item, 'REFUND_REQUIRED')}>Yêu cầu hoàn tiền</button><button type="button" className="button-primary" disabled={working === item.id} onClick={() => resolve(item, 'RECONCILED')}>Đã đối soát</button></div> : item.status === 'REFUND_REQUIRED' ? <button type="button" className="button-secondary" disabled={working === item.id} onClick={() => resolve(item, 'RECONCILED')}>Ghi nhận đã hoàn tiền</button> : '—'}</td>
        </tr>)}</tbody>
      </table></div>
      {!selectedId && <Pagination page={page} total={items.length} limit={limit} onChange={value => changeFilter('page', String(value))} onLimitChange={value => changeFilter('limit', String(value))} />}
    </>)}
  </section>;
}

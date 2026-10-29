import { RefreshCw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import { moneyLabel, formatPortalDate } from '../../components/customer/CustomerPortalHelpers';
import { PortalError, PortalLoading, PortalEmpty, PortalPageHeader } from '../../components/customer/CustomerPortalUi';

type Reconciliation = {
  id: string; reconciliationCode: string; status: 'PENDING_REVIEW' | 'REFUND_REQUIRED' | 'RECONCILED'; reason: string; amount: number;
  providerTransactionId: string | null; createdAt: string; reviewedAt: string | null; resolutionNote: string | null;
  transaction: { merchantOrderRef: string; invoice: { invoiceCode: string; status: string; reservation: { reference: string; customer: { fullName: string; email: string } } } };
};
const labels: Record<Reconciliation['status'], string> = { PENDING_REVIEW: 'Chờ đối soát', REFUND_REQUIRED: 'Cần hoàn tiền', RECONCILED: 'Đã đối soát' };

export function ManagerOnlinePaymentReconciliationsPage() {
  const resource = usePaginatedResource<Reconciliation>('/manager/online-payment-reconciliations?limit=100', 'manager-online-payment-reconciliations', true);
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
    {actionError && <PortalError message={actionError} onRetry={() => setActionError('')} />}
    <PortalPageHeader eyebrow="Đối soát thanh toán" title="VNPay thành công cần xử lý" description="Các khoản VNPay trả thành công sau khi hóa đơn hoặc reservation đã hết hiệu lực. Hệ thống không tự kích hoạt lại kho." action={<button className="button-secondary" type="button" onClick={resource.refresh} disabled={resource.loading}><RefreshCw size={16} /> Làm mới</button>} />
    {resource.loading ? <PortalLoading label="Đang tải hồ sơ đối soát…" /> : resource.error ? <PortalError message={resource.error} onRetry={resource.refresh} /> : !(resource.data?.items.length) ? <PortalEmpty icon={<ShieldAlert size={30} />} title="Chưa có khoản cần đối soát"><span>Khoản VNPay thành công muộn sẽ xuất hiện tại đây.</span></PortalEmpty> : <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Hồ sơ</th><th>Khách hàng / hóa đơn</th><th>Số tiền</th><th>Lý do</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{resource.data.items.map(item => <tr key={item.id}><td><strong>{item.reconciliationCode}</strong><small>{formatPortalDate(item.createdAt, true)}</small></td><td>{item.transaction.invoice.reservation.customer.fullName}<small>{item.transaction.invoice.invoiceCode} · {item.transaction.invoice.reservation.reference}</small></td><td><strong>{moneyLabel(item.amount)}</strong><small>{item.providerTransactionId || item.transaction.merchantOrderRef}</small></td><td>{item.reason}{item.resolutionNote && <small>{item.resolutionNote}</small>}</td><td><span className="status-warning">{labels[item.status]}</span></td><td>{item.status === 'PENDING_REVIEW' ? <div className="manager-inline-actions"><button type="button" className="button-secondary" disabled={working === item.id} onClick={() => resolve(item, 'REFUND_REQUIRED')}>Yêu cầu hoàn tiền</button><button type="button" className="button-primary" disabled={working === item.id} onClick={() => resolve(item, 'RECONCILED')}>Đã đối soát</button></div> : item.status === 'REFUND_REQUIRED' ? <button type="button" className="button-secondary" disabled={working === item.id} onClick={() => resolve(item, 'RECONCILED')}>Ghi nhận đã hoàn tiền</button> : '—'}</td></tr>)}</tbody></table></div>}
  </section>;
}

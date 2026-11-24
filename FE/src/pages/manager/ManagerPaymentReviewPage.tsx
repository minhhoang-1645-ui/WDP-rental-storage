import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import { first, money, date, type Row } from '../../components/manager/portal-data';
import { Facts, Modal, PageHeader, Status } from '../../components/manager/PortalUi';
import { ManagerTaskTable, ManagerTableFilter } from '../../components/manager/ManagerTaskTable';
import { useManagerTableParams } from '../../components/manager/manager-table-params';

export function ManagerPaymentReviewPage({ reconciliation = false }: { reconciliation?: boolean }) {
  const { user } = useAuth();
  const { params, page, limit, update } = useManagerTableParams();
  const status = params.get('status') ?? (reconciliation ? 'PENDING_REVIEW' : 'PENDING_VERIFICATION');
  const root = reconciliation ? '/manager/online-payment-reconciliations' : '/manager/payment-submissions';
  const resource = usePaginatedResource<Row>(`${root}${status ? '?status=' + encodeURIComponent(status) : ''}`, user?.id);
  const [selected, setSelected] = useState<Row>();
  const [reference, setReference] = useState(''), [note, setNote] = useState(''), [verified, setVerified] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const open = (row: Row) => { setSelected(row); setReference(''); setNote(''); setVerified(false); setError(''); };
  const record = params.get('record');
  useEffect(() => {
    const match = resource.data?.items.find(row => first(row, 'id') === record);
    if (match) setSelected(match);
  }, [record, resource.data]);
  const invoice = (row: Row) => first(row, 'invoice.invoiceCode', 'transaction.invoice.invoiceCode');
  const person = (row: Row) => first(row, 'customer.fullName', 'transaction.invoice.reservation.customer.fullName');
  const submit = async (action: string) => {
    if (!selected || busy || !note.trim() || !window.confirm('Xác nhận ghi nhận quyết định này?')) return;
    setBusy(true); setError('');
    try {
      const body = reconciliation ? { resolution: action, resolutionNote: note, refundReference: reference, refundConfirmed: verified } : action === 'verify' ? { reference, note } : { reason: note };
      await mutate(`${root}/${encodeURIComponent(first(selected, 'id'))}/${reconciliation ? 'resolve' : action}`, 'POST', body);
      setSelected(undefined); resource.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu quyết định.'); }
    finally { setBusy(false); }
  };
  const pending = selected?.status === (reconciliation ? 'PENDING_REVIEW' : 'PENDING_VERIFICATION');
  const refund = reconciliation && selected?.status === 'REFUND_REQUIRED';
  return <section><PageHeader title={reconciliation ? 'Đối soát thanh toán' : 'Xác minh chuyển khoản'}><Link className="button-secondary" to={reconciliation ? '/manager/payment-submissions' : '/manager/online-payment-reconciliations'}>{reconciliation ? 'Xác minh chuyển khoản' : 'Đối soát thanh toán'}</Link><button className="button-secondary" onClick={resource.refresh}>Làm mới</button></PageHeader>
    <ManagerTaskTable title="Hồ sơ thanh toán" items={(resource.data?.items ?? []).slice((page-1)*limit,page*limit)} total={resource.data?.total ?? 0} page={page} limit={limit} update={update} rowKey={row => first(row, 'id')} loading={resource.loading} refreshing={resource.refreshing} error={resource.error} retry={resource.refresh}
      rowDetail={row => ({ open: () => open(row), label: 'Xem hồ sơ thanh toán' })}
      columns={[{key:'code',label:'Hồ sơ / Hóa đơn',cell:row => <><strong>{first(row,'submissionCode','reconciliationCode')}</strong><small>{invoice(row)}</small></>},{key:'customer',label:'Khách hàng',cell:person},{key:'amount',label:'Số tiền',cell:row=>money(row.amount)},{key:'time',label:'Ngày gửi',cell:row=>date(first(row,'submittedAt','createdAt'),true)},{key:'status',label:'Trạng thái',cell:row=><Status value={row.status}/>} ]}
      toolbar={<ManagerTableFilter label="Trạng thái" value={status} onChange={value=>update('status',value)} options={reconciliation ? [['PENDING_REVIEW','Chờ đối soát'],['REFUND_REQUIRED','Cần hoàn tiền'],['RECONCILED','Đã xử lý']] : [['PENDING_VERIFICATION','Chờ xác minh'],['VERIFIED','Đã xác minh'],['REJECTED','Từ chối']]} />} />
    {selected && <Modal title={first(selected,'submissionCode','reconciliationCode')} busy={busy} onClose={()=>setSelected(undefined)}>
      <Facts items={[[ 'Khách hàng',person(selected)],['Hóa đơn',<Link to={`/manager/operations/invoices/${first(selected,'invoice.id','transaction.invoice.id')}`}>{invoice(selected)}</Link>],['Số tiền',money(selected.amount)],['Mã tham chiếu khách gửi',first(selected,'transferReference','providerTransactionId') || '—'],['Nội dung',first(selected,'customerNote','reason') || '—'],['Trạng thái',<Status value={selected.status}/>],['Kết quả',first(selected,'resolutionNote','rejectionReason') || '—']]} />
      {(pending || refund) && <div className="portal-form"><p>Chỉ xác nhận khi đã kiểm tra giao dịch thực tế bên ngân hàng. Thông báo của khách không phải bằng chứng đã nhận tiền.</p>
        {(!reconciliation || refund) && <label className="field-label">Mã giao dịch đã kiểm tra<input value={reference} onChange={e=>setReference(e.target.value)} disabled={busy}/></label>}
        <label className="field-label">Ghi chú / Lý do<textarea value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>
        <label><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} disabled={busy}/> Tôi đã kiểm tra và xác nhận kết quả thực tế.</label>
        {error && <p role="alert">{error}</p>}
        <button className="button-primary" disabled={busy || !verified || !note.trim() || ((!reconciliation || refund) && !reference.trim())} onClick={()=>void submit(reconciliation?'RECONCILED':'verify')}>{reconciliation?'Xác nhận đã xử lý':'Xác minh đã nhận tiền'}</button>
        {pending && <button className="button-secondary" disabled={busy || !note.trim()} onClick={()=>void submit(reconciliation?'REFUND_REQUIRED':'reject')}>{reconciliation?'Yêu cầu hoàn tiền':'Từ chối yêu cầu'}</button>}
      </div>}
    </Modal>}
  </section>;
}

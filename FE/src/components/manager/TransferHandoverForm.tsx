import type { Row } from './portal-data';

export function TransferHandoverForm({ busy, onSubmit, onProblem }: { busy: boolean; onSubmit: (input: Row) => void; onProblem: (note: string) => void }) {
  return <><form className="portal-form transfer-handover-form" onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onSubmit({ recipientName: fields.get('recipientName'), returnedKeyCount: Number(fields.get('returnedKeyCount')), deliveredKeyCount: Number(fields.get('deliveredKeyCount')), destinationReady: fields.get('destinationReady') === 'on', oldKeysReturned: fields.get('oldKeysReturned') === 'on', newKeysDelivered: fields.get('newKeysDelivered') === 'on', goodsMoved: fields.get('goodsMoved') === 'on', note: fields.get('note') });
  }}>
    <p>Kiểm tra kho cũ đã trống và đối chiếu chìa khóa, thẻ hoặc mã truy cập với khách trước khi xác nhận.</p>
    <label className="field-label">Người nhận kho mới<input name="recipientName" required minLength={2} maxLength={120} /></label>
    <div className="transfer-key-counts"><label className="field-label">Số chìa khóa/thẻ kho cũ đã thu<input name="returnedKeyCount" type="number" required min={0} max={50} step={1} /></label><label className="field-label">Số chìa khóa/thẻ kho mới đã giao<input name="deliveredKeyCount" type="number" required min={0} max={50} step={1} /></label></div>
    <label className="portal-checkbox"><input name="destinationReady" type="checkbox" required />Đã kiểm tra kho đích và xác nhận có thể bàn giao</label>
    <label className="portal-checkbox"><input name="goodsMoved" type="checkbox" required />Đã kiểm tra kho cũ và xác nhận kho trống</label>
    <label className="portal-checkbox"><input name="oldKeysReturned" type="checkbox" required />Đã thu lại chìa khóa/thẻ hoặc thu hồi mã truy cập kho cũ</label>
    <label className="portal-checkbox"><input name="newKeysDelivered" type="checkbox" required />Đã giao chìa khóa/thẻ hoặc cấp mã truy cập kho mới cho khách</label>
    <label className="field-label">Ghi chú bàn giao<textarea name="note" rows={3} maxLength={2000} placeholder="Nếu không dùng chìa khóa/thẻ vật lý, ghi rõ cách thu hồi mã cũ và cấp mã mới." /></label>
    <button className="button-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Hoàn tất chuyển kho'}</button>
  </form>
  <details className="manager-section"><summary>Báo vướng mắc cho quản lý</summary>
    <form className="portal-form" onSubmit={event => {
      event.preventDefault();
      onProblem(String(new FormData(event.currentTarget).get('problem') ?? '').trim());
    }}>
      <label className="field-label">Vướng mắc<textarea name="problem" minLength={3} maxLength={2000} required rows={3} /></label>
      <button className="button-secondary" disabled={busy}>Gửi vướng mắc</button>
    </form>
  </details></>;
}

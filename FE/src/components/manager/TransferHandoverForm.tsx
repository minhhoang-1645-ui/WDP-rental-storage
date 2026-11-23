import type { Row } from './portal-data';

export function TransferHandoverForm({ row, busy, onSubmit }: { row: Row; busy: boolean; onSubmit: (input: Row) => void }) {
  const unsigned = Boolean(row.commercial && typeof row.commercial === 'object' && !('acceptedAt' in row.commercial && row.commercial.acceptedAt));
  return <form className="portal-form transfer-handover-form" onSubmit={event => {
    event.preventDefault();
    if (unsigned) return;
    const fields = new FormData(event.currentTarget);
    onSubmit({ recipientName: fields.get('recipientName'), returnedKeyCount: Number(fields.get('returnedKeyCount')), deliveredKeyCount: Number(fields.get('deliveredKeyCount')), oldKeysReturned: fields.get('oldKeysReturned') === 'on', newKeysDelivered: fields.get('newKeysDelivered') === 'on', goodsMoved: fields.get('goodsMoved') === 'on', note: fields.get('note') });
  }}>
    <p>Kiểm tra kho cũ đã trống và đối chiếu chìa khóa, thẻ hoặc mã truy cập với khách trước khi xác nhận.</p>
    {unsigned && <p className="booking-alert is-warning">Khách cần ký phụ lục đổi loại kho trước khi hoàn tất.</p>}
    <label className="field-label">Người nhận kho mới<input name="recipientName" required minLength={2} maxLength={120} /></label>
    <div className="transfer-key-counts"><label className="field-label">Số chìa khóa/thẻ kho cũ đã thu<input name="returnedKeyCount" type="number" required min={0} max={50} step={1} /></label><label className="field-label">Số chìa khóa/thẻ kho mới đã giao<input name="deliveredKeyCount" type="number" required min={0} max={50} step={1} /></label></div>
    <label className="portal-checkbox"><input name="goodsMoved" type="checkbox" required />Đã kiểm tra kho cũ và xác nhận kho trống</label>
    <label className="portal-checkbox"><input name="oldKeysReturned" type="checkbox" required />Đã thu lại chìa khóa/thẻ hoặc thu hồi mã truy cập kho cũ</label>
    <label className="portal-checkbox"><input name="newKeysDelivered" type="checkbox" required />Đã giao chìa khóa/thẻ hoặc cấp mã truy cập kho mới cho khách</label>
    <label className="field-label">Ghi chú bàn giao<textarea name="note" rows={3} maxLength={2000} placeholder="Nếu không dùng chìa khóa/thẻ vật lý, ghi rõ cách thu hồi mã cũ và cấp mã mới." /></label>
    <button className="button-primary" disabled={busy || unsigned}>{busy ? 'Đang lưu…' : 'Hoàn tất chuyển kho'}</button>
  </form>;
}

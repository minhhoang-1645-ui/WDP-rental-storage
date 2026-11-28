import { Link } from 'react-router-dom';

export function ReturnInventoryNotice({ staff = false, contractId }: {
  staff?: boolean; remainingItemTypes?: number; pendingMovements?: number; contractId?: string;
}) {
  return <aside className="return-inventory-notice" aria-label="Chuẩn bị bàn giao kho">
    <h3>Chuẩn bị bàn giao kho</h3>
    <p>{staff
      ? 'Kiểm tra thực tế kho đã được dọn trống, ghi nhận hiện trạng và nhận lại chìa khóa hoặc thẻ. Sổ hàng hóa không phải điều kiện hoàn tất.'
      : 'Dọn hết đồ cá nhân và trả lại chìa khóa hoặc thẻ. Bạn không cần tạo phiếu xuất hay kiểm đếm từng món đồ để trả kho.'}</p>
    {staff && <ol><li>Đối chiếu hiện trạng thực tế của kho với khách.</li><li>Ghi nhận kết quả kiểm tra và chìa khóa hoặc thẻ đã nhận.</li><li>Xác nhận trả kho theo hồ sơ được phân công; tiền cọc được xử lý riêng.</li></ol>}
    <div className="portal-actions"><Link className="button-secondary" to={staff ? '/staff/stored-items' : contractId ? `/customer/stored-items?rentalContractId=${encodeURIComponent(contractId)}` : '/customer/stored-items'}>Xem sổ hàng hóa nếu cần</Link></div>
  </aside>;
}

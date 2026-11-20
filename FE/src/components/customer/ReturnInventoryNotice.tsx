import { Link } from 'react-router-dom';

export function ReturnInventoryNotice({ staff = false, remainingItemTypes, pendingMovements, contractId }: {
  staff?: boolean; remainingItemTypes?: number; pendingMovements?: number; contractId?: string;
}) {
  const blocked = (remainingItemTypes ?? 0) > 0 || (pendingMovements ?? 0) > 0;
  return <aside className={`return-inventory-notice${blocked ? ' is-blocked' : ''}`} aria-label="Điều kiện xuất hết hàng trước khi trả kho">
    <h3>{blocked ? 'Chưa thể hoàn tất nhận trả kho' : 'Xuất hết hàng trước khi trả kho'}</h3>
    <p>{staff ? 'Kho chỉ được bàn giao lại khi không còn hàng đang lưu và không còn phiếu nhập – xuất chưa hoàn tất.' : 'Cần xuất hết hàng, hoàn tất các phiếu và trả lại chìa khóa.'}</p>
    {remainingItemTypes !== undefined && <div className="return-stock-counts"><span><strong>{remainingItemTypes}</strong> mặt hàng còn tồn</span><span><strong>{pendingMovements ?? 0}</strong> phiếu chưa hoàn tất</span></div>}
    {staff && <ol><li>Khách tạo phiếu xuất cho toàn bộ số hàng còn trong kho.</li><li>Nhân viên kiểm đếm, hoàn tất phiếu xuất để tồn hàng về 0.</li><li>Khách trả chìa khóa/thẻ; nhân viên kiểm tra và xác nhận nhận lại kho.</li></ol>}
    <div className="portal-actions">{staff ? <><Link className="button-secondary" to="/staff/stored-items">Đối chiếu hàng đang lưu</Link><Link className="button-primary" to="/staff/stock-movements">Xử lý phiếu xuất hàng</Link></> : <Link className="button-secondary" to={contractId ? `/customer/stored-items?rentalContractId=${encodeURIComponent(contractId)}` : '/customer/stored-items'}>Kiểm tra hàng đang lưu</Link>}</div>
  </aside>;
}

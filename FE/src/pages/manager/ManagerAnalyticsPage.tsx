import { Download, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { money, date } from '../../components/manager/portal-data';
import { LoadState, PageHeader, Empty } from '../../components/manager/PortalUi';
import { useApiResource } from '../../services/useApiResource';
import { useLiveRefresh } from '../../services/live-events';
import type { ManagerReport } from '../../types/manager-report';

export function ManagerAnalyticsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const invalid = Boolean(from && to && from > to);
  const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const report = useApiResource<ManagerReport>(invalid ? null : `/manager/dashboard/analytics?${query}`, user?.id, true);
  useLiveRefresh('/manager/*', report.refresh);
  const data = report.data;
  const metrics = data ? [
    ['Tiền đã thu trong kỳ', money(data.finance.collectedAmount), `${data.finance.paymentCount} khoản thu đã ghi nhận; gồm cọc và dịch vụ.`, '/manager/operations/payments'],
    ['Cọc trên hóa đơn trả đủ trong kỳ', money(data.finance.depositOnFullyPaidInvoices), 'Theo ngày trả đủ; chưa gồm cọc của hóa đơn trả một phần. Không phải doanh thu thuê.', '/manager/operations/invoices?status=PAID'],
    ['Công nợ hiện tại', money(data.finance.outstandingAmount), `${data.finance.unpaidInvoices} hóa đơn chưa trả đủ còn dư; không gồm hóa đơn đã hủy.`, '/manager/operations/invoices'],
    ['Hoàn cọc đã duyệt, chưa kết thúc', money(data.finance.approvedRefundOutstanding), 'Theo quyết toán đã duyệt; chưa gồm cọc đang chờ xét duyệt hoặc chưa quyết toán.', '/manager/operations/deposit-settlements'],
  ] : [];
  const exportCsv = () => {
    if (!data) return;
    const csv = [['Chỉ số', 'Giá trị', 'Định nghĩa'], ...metrics.map(([name, value, definition]) => [name, value, definition])].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `nestbox-bao-cao-${from || 'tat-ca'}-${to || 'hien-tai'}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <section>
    <PageHeader title="Báo cáo vận hành">
      <Link className="button-secondary" to="/manager/reports/details">Biểu đồ chi tiết</Link>
      <button className="button-secondary" disabled={!data || report.refreshing} onClick={exportCsv}><Download size={16} />Xuất KPI tài chính CSV</button>
      <button className="button-secondary" disabled={report.loading || report.refreshing} onClick={report.refresh}><RefreshCw size={16} />Làm mới</button>
    </PageHeader>
    <div className="portal-toolbar">
      <label className="field-label">Từ ngày<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
      <label className="field-label">Đến ngày<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
      <button className="button-secondary" onClick={() => { setFrom(''); setTo(''); }}>Toàn bộ thời gian</button>
    </div>
    {invalid && <p role="alert" className="booking-alert is-error">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
    <LoadState loading={report.loading} error={report.error} retry={report.refresh} />
    {data && !report.error && <>
      <p className="portal-report-note">Cập nhật: {date(data.asOf, true)} · UTC+7. Lọc khoản thu theo ngày nhận tiền, cọc theo ngày hóa đơn trả đủ. Các chỉ số hiện tại không lọc theo kỳ.</p>
      <div className="portal-metrics">{metrics.map(([title, value, description, path]) => <Link className="portal-metric" to={path} key={title}><span>{title}</span><strong>{value}</strong><small>{description}</small></Link>)}</div>
      <p className="booking-alert">Tiền đã thu chỉ cộng các khoản tiền đã ghi nhận, không cộng trùng với hóa đơn hay thông báo chuyển khoản. VNPay đang chờ và thông báo chưa xác minh không được tính. Đây là dòng tiền thu, không phải doanh thu kế toán; chưa trừ khoản hoàn.</p>
      <section className="manager-section"><h2>Kho và hợp đồng hiện tại</h2><div className="portal-metrics">{[
        ['Tổng kho vật lý', data.units.total, 'Tất cả kho vật lý tại cơ sở.'], ['Kho sẵn sàng', data.units.available, 'Sẵn sàng; còn cần kiểm tra lịch kỳ thuê.'],
        ['Kho đang dùng', data.units.occupied, 'Đang sử dụng thực tế.'], ['Kho đang giữ', data.units.reserved, 'Đang được giữ, chưa sử dụng.'], ['Kho bảo trì', data.units.maintenance, 'Đang bảo trì, chưa khả dụng.'],
        ['Tỷ lệ sử dụng', data.units.utilizationPercent === null ? '—' : `${data.units.utilizationPercent}%`, 'Kho đang sử dụng / tổng kho vật lý, gồm cả kho bảo trì trong mẫu số.'],
        ['Hợp đồng hoạt động', data.activeContracts, 'Hợp đồng đang hoạt động; không phải số đơn đặt.'],
      ].map(([title, value, description]) => <article className="portal-metric" key={String(title)}><span>{title}</span><strong>{value}</strong><small>{description}</small></article>)}</div><Link className="button-secondary" to="/manager/units">Tra cứu kho</Link></section>
      <section className="manager-section"><h2>Hồ sơ cần Manager xử lý</h2><div className="portal-stat-list">{[
        ['unassignedStock', 'Nhập – xuất chưa phân công', '/manager/assignments?kind=stock-movements&assignment=unassigned'],
        ['unassignedSupport', 'Hỗ trợ chưa phân công', '/manager/assignments?kind=support-requests&assignment=unassigned'],
        ['unassignedMaintenance', 'Bảo trì chưa phân công', '/manager/assignments?kind=maintenance&assignment=unassigned'],
        ['escalatedSupport', 'Hỗ trợ chuyển cấp', '/manager/operations/support-requests?status=ESCALATED'],
        ['maintenanceReview', 'Bảo trì chờ nghiệm thu', '/manager/operations/maintenance?status=AWAITING_VERIFICATION'],
        ['paymentVerification', 'Chuyển khoản chờ xác minh', '/manager/payment-submissions'], ['depositReview', 'Cọc chờ xét duyệt', '/manager/operations/deposit-settlements'],
        ['onlineReconciliation', 'Giao dịch cần đối soát / hoàn tiền', '/manager/online-payment-reconciliations'],
      ].map(([key, title, path]) => <div key={key}><Link to={path}>{title}</Link><strong>{data.queue[key]}</strong></div>)}</div></section>
      <section className="manager-section"><h2>Việc đang giao cho Staff</h2><p>Đếm việc đã giao chưa hoàn tất trong ba nhóm nhập–xuất, hỗ trợ và bảo trì; không gồm việc đã chuyển quản lý nghiệm thu. Không đại diện toàn bộ công việc của nhân viên.</p>
        {!data.workload.length ? <Empty title="Chưa có nhân viên" /> : <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Nhân viên</th><th>Nhập – xuất</th><th>Hỗ trợ</th><th>Bảo trì</th><th>Tổng ba nhóm</th></tr></thead><tbody>{data.workload.map(person => <tr key={person.id}><td>{person.fullName}<small>{person.accountStatus === 'ACTIVE' ? 'Đang hoạt động' : 'Tài khoản không hoạt động'}</small></td><td>{person.stock}</td><td>{person.support}</td><td>{person.maintenance}</td><td>{person.stock + person.support + person.maintenance}</td></tr>)}</tbody></table></div>}
        <Link className="button-secondary" to="/manager/assignments">Phân công và xem kết quả</Link> <Link className="button-secondary" to="/manager/stored-items">Hàng đang lưu theo kho</Link>
      </section>
    </>}
  </section>;
}

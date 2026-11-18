import { CheckCircle2, ClipboardCheck, KeyRound, UserRound } from 'lucide-react';
import { date, first, object } from '../manager/portal-data';
import { handoverReportView } from '../../utils/handover-report';

export function HandoverReportCard({ appointment }: { appointment: unknown }) {
  const row = object(appointment), report = handoverReportView(row);
  if (!report) return row.handoverNote ? <section className="handover-report"><h3>Ghi chú bàn giao</h3><p className="handover-report-legacy">{first(row, 'handoverNote')}</p></section> : null;
  const confirmations = [
    ['identityVerified', 'Đã đối chiếu người nhận kho'], ['unitInspected', 'Đã kiểm tra hiện trạng các kho'],
    ['accessDelivered', 'Đã bàn giao chìa khóa/thẻ hoặc hướng dẫn truy cập'], ['documentsDelivered', 'Đã giao giấy tờ bàn giao'],
  ];
  return <section className="handover-report" aria-label="Biên bản bàn giao kho">
    <header><span className="handover-report-icon"><ClipboardCheck size={23} /></span><div><small>{first(row, 'appointmentCode')}</small><h3>Biên bản bàn giao kho</h3></div><span className="handover-report-badge">Đã ghi nhận</span></header>
    <dl className="handover-report-facts">
      <div><dt><UserRound size={15} />Người nhận</dt><dd>{first(report, 'recipientName') || 'Chưa ghi nhận'}</dd></div>
      <div><dt>Hình thức nhận</dt><dd>{report.recipientType === 'AUTHORIZED' ? 'Người được ủy quyền' : 'Khách đứng tên hợp đồng'}</dd></div>
      {Boolean(report.customerName) && <div><dt>Khách đứng tên</dt><dd>{first(report, 'customerName')}</dd></div>}
      <div><dt><KeyRound size={15} />Chìa khóa / thẻ đã giao</dt><dd>{typeof report.accessItemCount === 'number' ? `${report.accessItemCount} chiếc` : 'Chưa ghi nhận'}</dd></div>
      {Boolean(row.completedAt) && <div><dt>Thời điểm bàn giao</dt><dd>{date(row.completedAt, true)}</dd></div>}
      {first(row, 'completedBy.fullName') && <div><dt>Nhân viên bàn giao</dt><dd>{first(row, 'completedBy.fullName')}</dd></div>}
    </dl>
    {Boolean(report.authorizationBasis) && <div className="handover-report-condition"><strong>Căn cứ ủy quyền</strong><p>{first(report, 'authorizationBasis')}</p></div>}
    <div className="handover-report-condition"><strong>Hiện trạng kho khi bàn giao</strong><p>{first(report, 'condition') || 'Chưa ghi nhận'}</p></div>
    <ul className="handover-report-checks">{confirmations.map(([key, title]) => <li key={key} className={report[key] === true ? 'is-verified' : ''}><CheckCircle2 size={18} /><span>{report[key] === true ? title : `${title.replace(/^Đã /, '')}: chưa có ghi nhận`}</span></li>)}</ul>
    {Boolean(report.note) && <div className="handover-report-condition"><strong>Ghi chú thêm</strong><p>{first(report, 'note')}</p></div>}
  </section>;
}

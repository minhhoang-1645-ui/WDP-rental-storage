import { EntitySelect } from '../EntitySelect';
import { useState } from 'react';
import { ArrowRight, Check, PackageOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useActivity } from '../../activity/context';
import { activityText, type ActivityRow } from '../../utils/activity';
import { customerProgress, rentalSteps } from '../../utils/customer-progress';

const required = ['reservations', 'contracts', 'invoices', 'appointments', 'returns', 'payment-submissions'];
export function CustomerRentalProgress({ reservation: selected }: { reservation?: ActivityRow }) {
  const activity = useActivity(), [choice, setChoice] = useState('');
  const all = [...(activity.data.reservations ?? [])].sort((a, b) => (Date.parse(activityText(b, 'createdAt')) || 0) - (Date.parse(activityText(a, 'createdAt')) || 0));
  const ongoing = all.filter(row => !['EXPIRED', 'CANCELLED', 'REJECTED'].includes(String(row.status)));
  const options = ongoing.length ? ongoing : all;
  const reservation = selected ?? options.find(row => activityText(row, 'id') === choice) ?? options[0];
  if (!reservation) return null;
  const progress = customerProgress(reservation, activity.data), ready = required.every(kind => activity.data[kind]);
  return <section className="rental-progress" aria-label="Tiến độ thuê kho">
    <header><div><span className="section-eyebrow">Đơn thuê của bạn</span><h2>Tiếp tục từ bước đang làm</h2></div>{!selected && options.length > 1 && <label><span>Chọn đơn để theo dõi</span><EntitySelect aria-label="Chọn đơn để theo dõi" value={activityText(reservation, 'id')} onValueChange={selectedValue => setChoice(selectedValue)}>{options.map(row => <option key={activityText(row, 'id')} value={activityText(row, 'id')}>{activityText(row, 'reference') || activityText(row, 'id')} · {activityText(row, 'product.name') || activityText(row, 'storageType.name') || 'Đơn thuê kho'}</option>)}</EntitySelect></label>}</header>
    <div className="rental-progress-caption"><PackageOpen size={19} /><span>{progress.reference} · {activityText(reservation, 'product.name') || activityText(reservation, 'storageType.name') || 'Kho lưu trữ'}</span></div>
    {!ready ? <p role="status">Đang đối chiếu hợp đồng, thanh toán và lịch nhận kho. {activity.failed.length > 0 && 'Chưa lấy đủ dữ liệu; hãy kiểm tra kết nối và làm mới.'}</p> : <>
      <ol>{rentalSteps.map((name, index) => <li key={name} className={progress.closed ? '' : index < progress.stage ? 'is-done' : index === progress.stage ? 'is-current' : ''} aria-current={!progress.closed && index === progress.stage ? 'step' : undefined}><span>{!progress.closed && index < progress.stage ? <Check size={15} /> : index + 1}</span><strong>{name}</strong></li>)}</ol>
      <div className="rental-progress-next"><div><h3>{progress.title}</h3><p>{progress.message}</p></div><Link to={progress.to} className="button-primary">{progress.cta}<ArrowRight size={16} /></Link></div>
    </>}
  </section>;
}

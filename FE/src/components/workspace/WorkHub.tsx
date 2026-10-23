import { ArrowRight, CircleCheck, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface WorkAction { title: string; description: string; to: string; icon: LucideIcon; count?: number | string; tone?: 'attention' | 'normal' }
export function WorkHub({ title, description, actions }: { title: string; description: string; actions: WorkAction[] }) {
  return <section className="work-hub" aria-label={title}><header className="work-hub-heading"><div><h2>{title}</h2><p>{description}</p></div></header><div className="work-hub-grid">{actions.map(({ title: name, description: copy, to, icon: Icon, count, tone }) => <Link key={to} to={to} className={`work-hub-card${tone === 'attention' ? ' needs-attention' : ''}`}><span className="work-hub-icon"><Icon size={21} /></span><div className="work-hub-copy"><strong>{name}</strong><p>{copy}</p></div>{count !== undefined && <span className="work-hub-count" aria-label={`${count} hồ sơ`}>{count}</span>}<ArrowRight size={17} className="work-hub-arrow" /></Link>)}</div></section>;
}
const steps = [
  { title: 'Chọn & đặt kho', text: 'Chọn loại kho, kỳ thuê và dịch vụ.', path: '/booking' },
  { title: 'Thanh toán', text: 'Theo dõi hóa đơn sau khi được duyệt.', path: '/customer/payments' },
  { title: 'Nhận bàn giao', text: 'Đặt lịch và đến nhận kho theo giờ đã xác nhận.', path: '/customer/appointments' },
  { title: 'Sử dụng kho', text: 'Gửi/lấy hàng, gia hạn hoặc cần hỗ trợ.', path: '/customer/rentals' },
];
export function CustomerJourney() {
  return <section className="customer-journey" aria-label="Quy trình thuê kho"><div className="work-hub-heading"><div><h2>Thuê kho qua 4 bước</h2><p>Mỗi hồ sơ có tiến độ riêng. Mở từng bước để xem thông tin của bạn.</p></div></div><ol>{steps.map((step, index) => <li key={step.path}><Link to={step.path}><span className="journey-number">{index + 1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div></Link></li>)}</ol></section>;
}
export function WorkflowHint({ title = 'Bước tiếp theo', children }: { title?: string; children: React.ReactNode }) {
  return <aside className="workflow-hint" aria-label={title}><CircleCheck size={20} /><div><strong>{title}</strong><p>{children}</p></div></aside>;
}

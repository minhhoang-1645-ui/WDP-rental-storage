import type { LucideIcon } from 'lucide-react'
import { ArrowRight, CalendarClock, CircleHelp, CreditCard, FileText, PackageOpen, Repeat2, Warehouse } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { PortalEmpty, PortalPageHeader } from '../../components/customer/CustomerPortalUi'

const modules: Record<string, { eyebrow: string; title: string; description: string; icon: LucideIcon }> = {
  rentals: { eyebrow: 'Kho đang thuê', title: 'Kho của tôi', description: 'Theo dõi kho đang sử dụng khi dữ liệu vận hành sẵn sàng.', icon: Warehouse },
  contracts: { eyebrow: 'Hợp đồng', title: 'Hợp đồng của tôi', description: 'Xem hợp đồng sau khi quy trình xác nhận được kết nối.', icon: FileText },
  payments: { eyebrow: 'Thanh toán', title: 'Thanh toán', description: 'Theo dõi giao dịch khi hệ thống thanh toán được triển khai.', icon: CreditCard },
  appointments: { eyebrow: 'Lịch hẹn', title: 'Lịch hẹn', description: 'Theo dõi lịch khảo sát, nhận kho hoặc các cuộc hẹn khác.', icon: CalendarClock },
  renewals: { eyebrow: 'Gia hạn', title: 'Gia hạn thuê kho', description: 'Gửi và theo dõi yêu cầu gia hạn khi có quy trình hỗ trợ.', icon: Repeat2 },
  transfers: { eyebrow: 'Chuyển đổi kho', title: 'Chuyển đổi kho', description: 'Theo dõi yêu cầu đổi loại kho hoặc chuyển vị trí.', icon: PackageOpen },
  support: { eyebrow: 'Hỗ trợ', title: 'Hỗ trợ', description: 'Quản lý các yêu cầu hỗ trợ và trao đổi với WDP.', icon: CircleHelp },
}

export function CustomerFutureModulePage() {
  const location = useLocation()
  const key = location.pathname.split('/').filter(Boolean).at(-1) ?? 'rentals'
  const module = modules[key] ?? modules.rentals
  const Icon = module.icon
  return <section className="customer-page"><PortalPageHeader eyebrow={module.eyebrow} title={module.title} description={module.description} /><PortalEmpty icon={<Icon size={31} />} title="Chưa có dữ liệu để hiển thị"><span>Backend hiện chưa có API cho mục này, nên Customer Portal không tạo dữ liệu mẫu. Khi API sẵn sàng, dữ liệu của bạn sẽ hiển thị tại đây.</span><Link className="button-secondary" to="/customer/reservations">Xem reservation của tôi <ArrowRight size={16} /></Link></PortalEmpty></section>
}

import { AtSign, Phone, ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '../../auth/auth-context'
import { PortalPageHeader } from '../../components/customer/CustomerPortalUi'

export function CustomerProfilePage() {
  const { user } = useAuth()
  return <section className="customer-page">
    <PortalPageHeader eyebrow="Tài khoản" title="Hồ sơ cá nhân" description="Thông tin hiện được lấy từ phiên đăng nhập của bạn." />
    <div className="customer-profile-layout"><section className="customer-panel"><div className="customer-profile-identity"><span className="customer-profile-avatar"><UserRound size={28} /></span><div><h2>{user?.fullName}</h2><p>Tài khoản khách hàng WDP Storage</p></div></div><dl className="customer-profile-fields"><div><dt><UserRound size={16} /> Họ và tên</dt><dd>{user?.fullName || 'Chưa cập nhật'}</dd></div><div><dt><AtSign size={16} /> Email</dt><dd>{user?.email || 'Chưa cập nhật'}</dd></div><div><dt><Phone size={16} /> Số điện thoại</dt><dd>{user?.phone || 'Chưa cập nhật'}</dd></div><div><dt><ShieldCheck size={16} /> Vai trò</dt><dd>Khách hàng</dd></div></dl></section><aside className="customer-panel customer-profile-readonly"><h2>Chỉnh sửa hồ sơ</h2><p>Backend hiện chưa có API cập nhật hồ sơ khách hàng. Thông tin ở đây đang ở chế độ chỉ đọc.</p><button className="button-secondary" type="button" disabled>Chỉnh sửa thông tin</button></aside></div>
  </section>
}

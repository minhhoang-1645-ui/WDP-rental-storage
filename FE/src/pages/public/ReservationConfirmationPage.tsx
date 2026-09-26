import { CheckCircle2, Clock3, Mail, Phone } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ButtonLink } from '../../components/ui/ButtonLink'
import { Container } from '../../components/ui/Container'

interface ConfirmationState { unitName?: string; fullName?: string; email?: string; date?: string; duration?: string }

export function ReservationConfirmationPage() {
  const { state } = useLocation()
  const details = (state ?? {}) as ConfirmationState
  return <section className="section-space"><Container className="max-w-3xl"><div className="border border-border bg-white p-7 sm:p-12"><CheckCircle2 className="text-success" size={48} /><p className="eyebrow mt-7">Đã nhận yêu cầu</p><h1 className="mt-3 text-4xl font-bold tracking-tight">Cảm ơn{details.fullName ? `, ${details.fullName}` : ''}.</h1><p className="mt-5 text-lg leading-8 text-slate">Yêu cầu giữ chỗ{details.unitName ? ` cho ${details.unitName}` : ''} đã được ghi nhận trong phiên demo. Khi kết nối backend, WDP sẽ gửi mã yêu cầu và phản hồi qua email.</p><div className="mt-8 grid gap-5 border-y border-border py-7 sm:grid-cols-3"><div><Mail className="text-navy" size={21} /><p className="mt-3 text-sm font-semibold">Kênh phản hồi</p><p className="mt-1 text-sm text-slate">{details.email || 'Email đã cung cấp'}</p></div><div><Clock3 className="text-navy" size={21} /><p className="mt-3 text-sm font-semibold">Bước tiếp theo</p><p className="mt-1 text-sm text-slate">Kiểm tra kho và báo giá</p></div><div><Phone className="text-navy" size={21} /><p className="mt-3 text-sm font-semibold">Cần hỗ trợ</p><p className="mt-1 text-sm text-slate">1900 0000 (mẫu)</p></div></div><h2 className="mt-8 text-xl font-semibold">WDP sẽ xác nhận những gì?</h2><ol className="mt-4 space-y-3 text-slate"><li><b>01.</b> Kho thực tế còn trống và điều kiện truy cập</li><li><b>02.</b> Chi phí thuê, tiền đặt cọc và các phí tùy chọn</li><li><b>03.</b> Các bước ký hợp đồng, thanh toán và nhận kho</li></ol><div className="mt-9 flex flex-wrap gap-3"><ButtonLink to="/storage">Xem thêm lựa chọn</ButtonLink><ButtonLink to="/" variant="secondary">Về trang chủ</ButtonLink></div><p className="mt-6 text-xs leading-5 text-slate">Đây là xác nhận giao diện bằng mock data; chưa có dữ liệu được gửi tới backend hoặc bên thứ ba.</p></div></Container></section>
}

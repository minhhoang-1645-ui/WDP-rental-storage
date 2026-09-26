import { Mail, MapPin, Phone, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Container } from '../ui/Container'

export function Footer() {
  return <footer className="bg-ink py-14 text-white"><Container><div className="grid gap-10 border-b border-white/15 pb-12 md:grid-cols-2 lg:grid-cols-4"><div><div className="flex items-center gap-2 text-lg font-bold"><Warehouse size={22} /> WDP Storage</div><p className="mt-4 max-w-xs text-sm leading-6 text-slate-300">Nền tảng quản lý kho tự quản cho một cơ sở. Thông tin vận hành hiện là dữ liệu mẫu.</p></div><div><h2 className="footer-title">Chọn kho</h2><Link to="/storage">Kho đang nhận yêu cầu</Link><Link to="/size-guide">Hướng dẫn kích thước</Link><Link to="/storage?type=climate&size=all&duration=3">Kho điều hòa</Link></div><div><h2 className="footer-title">Hỗ trợ</h2><Link to="/#how-it-works">Cách thuê kho</Link><Link to="/#faq">Câu hỏi thường gặp</Link><Link to="/account/reservations">Khu vực khách hàng</Link><a href="#legal">Điều khoản & quyền riêng tư</a></div><div id="contact"><h2 className="footer-title">Liên hệ mẫu</h2><p><MapPin size={16} /> Một cơ sở tại TP. Hồ Chí Minh</p><p><Phone size={16} /> 1900 0000</p><p><Mail size={16} /> hello@wdp-storage.vn</p></div></div><div id="legal" className="flex flex-col justify-between gap-3 pt-6 text-xs text-slate-400 sm:flex-row"><p>© 2026 WDP Storage.</p><p>Địa chỉ, hotline, tình trạng kho và chi phí đều là placeholder cho đến khi WDP cung cấp dữ liệu thật.</p></div></Container></footer>
}


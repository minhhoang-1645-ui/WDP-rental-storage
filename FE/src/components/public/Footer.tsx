import { PublicBrandMark } from './PublicBrandMark'
import { Mail, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { portalDestination } from '../../auth/portal-routing'
import { facility } from '../../config/facility'
import { Container } from '../ui/Container'

export function Footer() {
  const { user } = useAuth()
  const supportPath = user
    ? user.role === 'STORAGE_CUSTOMER' ? '/customer/support' : portalDestination(user.role)
    : '/account/login?returnTo=%2Fcustomer%2Fsupport'
  const supportLabel = !user || user.role === 'STORAGE_CUSTOMER' ? 'Gửi yêu cầu hỗ trợ' : 'Khu vực làm việc'

  return <footer className="public-footer landing-footer" aria-label="Thông tin NestBox">
    <Container>
      <div className="public-footer-grid">
        <div>
          <Link to="/" className="public-brand public-footer-brand" aria-label="NestBox Storage - Trang chủ">
            <PublicBrandMark />
          </Link>
          <p className="footer-brand-copy">Kho tự quản cho đồ cá nhân và hàng kinh doanh. Chọn không gian phù hợp và quản lý kỳ thuê trực tuyến.</p>
        </div>
        <div>
          <h2>Dịch vụ</h2>
          <nav className="public-footer-links" aria-label="Liên kết cuối trang">
            <Link to="/storage">Kho lưu trữ</Link>
            <Link to="/size-guide">So sánh kho</Link>
            <Link to="/facilities">Cơ sở</Link>
          </nav>
        </div>
        <div>
          <h2>Hỗ trợ</h2>
          <nav className="public-footer-links" aria-label="Hỗ trợ khách hàng">
            <Link to="/#how-it-works">Cách thuê kho</Link>
            <Link to="/#faq">Câu hỏi thường gặp</Link>
          </nav>
        </div>
        <div>
          <h2>Liên hệ</h2>
          <address>
            <div className="public-footer-links">
              {facility.phoneHref && <a href={facility.phoneHref}><Phone size={17} aria-hidden="true" /> {facility.phone}</a>}
              {facility.emailHref && <a href={facility.emailHref}><Mail size={17} aria-hidden="true" /> {facility.email}</a>}
              <Link to={supportPath}>{supportLabel}</Link>
            </div>
          </address>
        </div>
      </div>
      <small className="public-footer-copyright">© 2026 NestBox Storage</small>
    </Container>
  </footer>
}

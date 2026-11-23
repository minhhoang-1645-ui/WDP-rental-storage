import { Mail, MapPin, Phone, Warehouse } from 'lucide-react'
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

  return <footer id="facility" className="public-footer landing-footer" aria-label="Thông tin NestBox">
    <Container>
      <div className="public-footer-grid">
        <div>
          <Link to="/" className="public-brand public-footer-brand" aria-label="NestBox Storage - Trang chủ">
            <span><Warehouse size={18} aria-hidden="true" /></span>
            <strong>NestBox <span>Storage</span></strong>
          </Link>
          <nav className="public-footer-links" aria-label="Liên kết cuối trang">
            <Link to="/storage">Xem kho</Link>
            <Link to="/size-guide">So sánh kho</Link>
            <Link to="/#faq">Câu hỏi thường gặp</Link>
            <Link to={supportPath}>{supportLabel}</Link>
          </nav>
        </div>
        <div>
          <h2>Cơ sở NestBox</h2>
          <address>
            <p><MapPin size={17} aria-hidden="true" /> {facility.address}{facility.addressIllustrative && ' (minh họa)'}</p>
            <p>{facility.hours}{facility.hoursIllustrative && ' (minh họa)'}</p>
            <div className="public-footer-links">
              {facility.phoneHref && <a href={facility.phoneHref}><Phone size={17} aria-hidden="true" /> {facility.phone}</a>}
              {facility.emailHref && <a href={facility.emailHref}><Mail size={17} aria-hidden="true" /> {facility.email}</a>}
            </div>
          </address>
        </div>
      </div>
      <small className="public-footer-copyright">© 2026 NestBox Storage</small>
    </Container>
  </footer>
}

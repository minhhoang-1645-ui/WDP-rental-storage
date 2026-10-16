import { useAuth } from "../../auth/auth-context";
import { portalDestination } from "../../auth/portal-routing";
import { Mail, MapPin, Phone, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";
import { Container } from "../ui/Container";
import { facility } from '../../config/facility';

export function Footer() {
  const { user } = useAuth();
  const accountPath = user ? portalDestination(user.role) : "/account/login";
  return (
    <footer className="public-footer bg-ink py-14 text-white">
      <Container>
        <div className="grid gap-10 border-b border-white/15 pb-12 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold">
              <Warehouse size={22} /> WDP Storage
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-300">
              Quản lý thuê kho tự quản tại một cơ sở. Theo dõi đặt kho, hợp đồng
              và hỗ trợ trong khu vực của bạn.
            </p>
          </div>
          <div>
            <h2 className="footer-title">Chọn kho</h2>
            <Link to="/storage">Kho đang nhận yêu cầu</Link>
            <Link to="/size-guide">Hướng dẫn kích thước</Link>
            <Link to="/storage?type=climate&size=all&duration=3">
              Kho điều hòa
            </Link>
          </div>
          <div>
            <h2 className="footer-title">Hỗ trợ</h2>
            <Link to="/#how-it-works">Cách thuê kho</Link>
            <Link to="/#faq">Câu hỏi thường gặp</Link>
            <Link to={accountPath}>Khu vực của bạn</Link>
            <a href="#legal">Thông tin dự án</a>
          </div>
          <div id="contact">
            <h2 className="footer-title">Thông tin liên hệ</h2>
            <p>
              <MapPin size={16} /> {facility.address}
            </p>
            <p>
              <Phone size={16} /> {facility.phoneHref ? <a href={facility.phoneHref}>{facility.phone}</a> : facility.phone}
            </p>
            <p>
              <Mail size={16} /> {facility.emailHref ? <a href={facility.emailHref}>{facility.email}</a> : facility.email}
            </p>
            <p>{facility.hours}</p>
            {facility.illustrative && <small className="text-slate-400">Thông tin liên hệ minh họa cho đồ án.</small>}
          </div>
        </div>
        <div
          id="legal"
          className="flex flex-col justify-between gap-3 pt-6 text-xs text-slate-400 sm:flex-row"
        >
          <p>© 2026 WDP Storage.</p>
          <p>
            Thông tin liên hệ cần được cơ sở xác nhận. Báo giá được hiển thị
            theo dữ liệu của từng hồ sơ.
          </p>
        </div>
      </Container>
    </footer>
  );
}

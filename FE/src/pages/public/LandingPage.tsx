import { ArrowRight, CalendarCheck, Check, ChevronDown, ClipboardCheck, KeyRound, MapPin, Package, ReceiptText, Search, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import { QuickFinder } from '../../components/public/QuickFinder'
import { StorageSizeCard } from '../../components/public/StorageSizeCard'
import { StorageImage } from '../../components/public/StorageImage'
import { Container } from '../../components/ui/Container'
import { faqs, landingWarehousePhoto } from '../../data/storage'
import { FacilityCards } from './FacilitiesPage'

const steps = [
  { icon: Search, title: 'Tìm kho phù hợp', description: 'Chọn cơ sở, kích thước và ngày bắt đầu để kiểm tra kho trống.' },
  { icon: CalendarCheck, title: 'Đặt kho', description: 'Chọn ô và thời gian thuê, xem chi phí rồi gửi yêu cầu đặt kho.' },
  { icon: ClipboardCheck, title: 'Ký và thanh toán', description: 'Khi đơn được xác nhận, ký đủ hợp đồng rồi thanh toán hóa đơn đầu tiên.' },
  { icon: KeyRound, title: 'Nhận kho', description: 'Đặt lịch bàn giao sau khi thanh toán đủ. Sử dụng kho từ ngày bắt đầu thuê sau khi đã nhận kho.' },
]

const benefits = [
  { icon: ShieldCheck, title: 'Không gian riêng', description: 'Bạn tự đóng gói, sắp xếp và quản lý đồ trong ô kho đã thuê.' },
  { icon: Package, title: 'Chọn theo nhu cầu', description: 'So sánh diện tích và kích thước để chọn kho vừa với đồ cần lưu.' },
  { icon: ReceiptText, title: 'Chi phí rõ ràng', description: 'Xem tiền thuê, tiền cọc và dịch vụ đã chọn trước khi gửi đơn.' },
  { icon: CalendarCheck, title: 'Bàn giao theo lịch', description: 'Chọn lịch nhận kho để nhân viên hướng dẫn cách ra vào và bàn giao ô kho.' },
]

export function LandingPage() {
  const { facilities, storageSizes, storageListings, approvedDurations } = useCatalog()
  const duration = String(approvedDurations.includes(3) ? 3 : approvedDurations[0])
  const conditions = [
    { id: 'standard', label: 'Kho tiêu chuẩn' },
    { id: 'climate', label: 'Kho điều hòa' },
  ].filter(condition => storageListings.some(product => product.condition === condition.id))

  return <div className="storage-home">
    <section className="landing-hero" aria-labelledby="landing-title">
      <Container>
        <div className="landing-hero-layout">
          <div className="landing-intro">
            <h1 id="landing-title">Thuê kho tự quản <span>an&nbsp;toàn, linh hoạt và rõ&nbsp;giá</span></h1>
            <p>Tìm kho và gửi đơn trực tuyến. Khi đơn được xác nhận, ký hợp đồng, thanh toán và đặt lịch mang đồ đến kho.</p>
            <ul className="landing-hero-checks">
              {['Ô kho riêng', 'Xem chi phí trước khi đặt', 'Nhận kho theo lịch'].map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}
            </ul>
            <div className="landing-actions">
              <a className="button-primary" href="#find-storage">Tìm kho phù hợp <ArrowRight size={17} aria-hidden="true" /></a>
              <Link className="button-secondary" to="/size-guide">So sánh kho</Link>
            </div>
          </div>
          <figure>
            <StorageImage src={landingWarehousePhoto} alt="Hành lang với các ô kho tự quản" fetchPriority="high" />
            <figcaption>Ảnh minh họa · <a href="https://unsplash.com/photos/a-row-of-storage-units-with-yellow-doors-9OfBsfty2x4">Aga Adamek</a></figcaption>
          </figure>
        </div>
        <div className="landing-finder" id="find-storage">
          <h2>Tìm kho theo kỳ thuê</h2>
          <QuickFinder />
        </div>
      </Container>
    </section>

    <section className="landing-trust" aria-label="Thông tin đặt kho">
      <Container className="landing-trust-grid">
        <div><MapPin aria-hidden="true" /><span><strong>{facilities.length ? `${facilities.length} cơ sở công khai` : 'Danh mục cơ sở'}</strong><Link to="/facilities">Xem các cơ sở</Link></span></div>
        <div><Package aria-hidden="true" /><span><strong>{storageListings.length ? `${storageListings.length} loại kho` : 'Danh mục kho'}</strong><span>So sánh theo nhu cầu lưu trữ</span></span></div>
        <div><ClipboardCheck aria-hidden="true" /><span><strong>Hợp đồng trực tuyến</strong><span>Ký sau khi đơn được xác nhận</span></span></div>
      </Container>
    </section>

    {storageSizes.length > 0 && <section id="sizes" className="landing-section" aria-labelledby="landing-sizes">
      <Container>
        <header className="landing-section-heading">
          <div><h2 id="landing-sizes">Chọn kích thước kho</h2><p>Đối chiếu diện tích và giá thuê trước khi chọn.</p></div>
          <Link className="landing-text-link" to="/storage">Xem tất cả kho <ArrowRight size={17} aria-hidden="true" /></Link>
        </header>
        <div className="landing-size-grid">
          {storageSizes.map(size => <StorageSizeCard key={size.id} size={size} duration={duration}
            products={storageListings.filter(product => product.sizeId === size.id)} />)}
        </div>
        <div id="amenities" className="landing-condition-links">
          {conditions.map(({ id, label }) => <Link className="button-secondary" key={id}
            to={`/storage?${new URLSearchParams({ size: 'all', type: id, duration })}`}>{label}</Link>)}
        </div>
      </Container>
    </section>}

    <section className="landing-section landing-section-tinted" aria-labelledby="landing-benefits"><Container>
      <header className="landing-section-heading"><h2 id="landing-benefits">Vì sao chọn NestBox</h2></header>
      <div className="landing-feature-grid">
        {benefits.map(({ icon: Icon, title, description }) => <article className="landing-feature-card" key={title}>
          <span className="landing-step-icon"><Icon size={20} aria-hidden="true" /></span>
          <h3>{title}</h3><p>{description}</p>
        </article>)}
      </div>
    </Container></section>

    <section id="how-it-works" className="landing-section" aria-labelledby="landing-steps"><Container>
        <header className="landing-section-heading"><h2 id="landing-steps">Cách thuê kho</h2></header>
        <ol className="landing-steps">
          {steps.map(({ icon: Icon, title, description }, index) => <li className="landing-feature-card" key={title}>
            <span className="landing-step-icon"><Icon size={19} aria-hidden="true" /></span>
            <h3>{index + 1}. {title}</h3><p>{description}</p>
          </li>)}
        </ol>
    </Container></section>

    {facilities.length > 0 && <section id="facility" className="landing-section landing-section-tinted" aria-labelledby="landing-facilities"><Container>
      <header className="landing-section-heading">
        <h2 id="landing-facilities">Cơ sở nổi bật</h2>
        <Link className="landing-text-link" to="/facilities">Xem toàn bộ cơ sở <ArrowRight size={17} aria-hidden="true" /></Link>
      </header>
      <FacilityCards facilities={facilities.slice(0, 3)} compact />
    </Container></section>}

    <section id="faq" className="landing-section" aria-labelledby="landing-faq"><Container className="landing-help">
      <div>
        <h2 id="landing-faq">Câu hỏi thường gặp</h2>
        <Link className="landing-text-link" to="/facilities">Xem giờ vào kho theo cơ sở <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
        <div className="landing-faq-list">
          {faqs.map(([question, answer]) => <details key={question}>
            <summary>{question}<ChevronDown size={17} aria-hidden="true" /></summary>
            <p>{answer}</p>
          </details>)}
        </div>
    </Container></section>

    <section className="landing-final" aria-labelledby="landing-final-title"><Container>
      <div><h2 id="landing-final-title">Bạn cần thêm chỗ để đồ?</h2><p>Chọn cơ sở và kiểm tra kho trống theo ngày bạn cần.</p></div>
      <Link className="button-primary" to="/storage">Xem danh sách kho <ArrowRight size={17} aria-hidden="true" /></Link>
    </Container></section>
  </div>
}

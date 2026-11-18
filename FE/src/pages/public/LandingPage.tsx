import { ArrowRight, CalendarCheck, ChevronDown, ClipboardCheck, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import { QuickFinder } from '../../components/public/QuickFinder'
import { StorageSizeCard } from '../../components/public/StorageSizeCard'
import { StorageImage } from '../../components/public/StorageImage'
import { Container } from '../../components/ui/Container'
import { faqs, landingWarehousePhoto } from '../../data/storage'

const steps = [
  { icon: Search, title: 'Chọn kho', description: 'Chọn kích thước và thời gian thuê.' },
  { icon: ClipboardCheck, title: 'Ký và thanh toán', description: 'Sau khi đơn được xác nhận, ký hợp đồng và thanh toán hóa đơn.' },
  { icon: CalendarCheck, title: 'Nhận kho', description: 'Đặt lịch để nhận chìa khóa và hướng dẫn.' },
]

export function LandingPage() {
  const { storageSizes, storageListings, approvedDurations } = useCatalog()
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
            <h1 id="landing-title">Thuê kho tự quản <span>tại TP.HCM</span></h1>
            <p>Từ vài thùng đồ đến hàng kinh doanh. Chọn kho theo kích thước và thời gian bạn cần.</p>
            <Link className="landing-text-link" to="/size-guide">So sánh kích thước <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <figure>
            <StorageImage src={landingWarehousePhoto} alt="Thùng hàng được xếp trên kệ trong kho" fetchPriority="high" />
          </figure>
        </div>
        <div className="landing-finder"><QuickFinder /></div>
      </Container>
    </section>

    <section id="sizes" className="landing-section" aria-labelledby="landing-sizes">
      <Container>
        <header className="landing-section-heading">
          <h2 id="landing-sizes">Chọn kích thước kho</h2>
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
    </section>

    <Container className="landing-help landing-section">
      <section id="how-it-works" aria-labelledby="landing-steps">
        <h2 id="landing-steps">Cách thuê kho</h2>
        <ol className="landing-steps">
          {steps.map(({ icon: Icon, title, description }) => <li key={title}>
            <span className="landing-step-icon"><Icon size={19} aria-hidden="true" /></span>
            <div><h3>{title}</h3><p>{description}</p></div>
          </li>)}
        </ol>
      </section>
      <section id="faq" aria-labelledby="landing-faq">
        <h2 id="landing-faq">Câu hỏi thường gặp</h2>
        <div className="landing-faq-list">
          {faqs.map(([question, answer]) => <details key={question}>
            <summary>{question}<ChevronDown size={17} aria-hidden="true" /></summary>
            <p>{answer}</p>
          </details>)}
        </div>
      </section>
    </Container>
  </div>
}

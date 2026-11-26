import { ArrowRight, Box, CalendarDays, ChevronDown, ClipboardCheck, CreditCard, Layers, MapPin, Search, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import { QuickFinder } from '../../components/public/QuickFinder'
import { ComparisonChoice } from '../../components/public/StorageComparison'
import { StorageImage } from '../../components/public/StorageImage'
import { Container } from '../../components/ui/Container'
import { faqs } from '../../data/storage'

const steps = [
  { icon: Search, title: 'Tìm kho', text: 'Chọn cơ sở, kích thước và thời gian thuê phù hợp.' },
  { icon: ClipboardCheck, title: 'Gửi đơn đặt kho', text: 'Chọn ô kho khả dụng, xem chi phí và gửi yêu cầu.' },
  { icon: CreditCard, title: 'Ký và thanh toán', text: 'Sau khi đơn được xác nhận, ký hợp đồng và thanh toán hóa đơn ban đầu qua VNPay.' },
  { icon: Box, title: 'Nhận kho', text: 'Đặt lịch bàn giao khi đủ điều kiện và sử dụng kho theo kỳ thuê.' },
]
const benefits = [
  { icon: Box, title: 'Ô kho riêng', text: 'Bạn tự sắp xếp và quản lý đồ đạc.' },
  { icon: CreditCard, title: 'Chi phí rõ ràng', text: 'Xem chi phí trước khi gửi yêu cầu.' },
  { icon: Layers, title: 'Chọn kho theo nhu cầu', text: 'Chọn kích thước và kỳ thuê phù hợp.' },
  { icon: CalendarDays, title: 'Bàn giao theo lịch', text: 'Chọn thời gian nhận kho phù hợp.' },
]
const questions = [
  ['Kho tự quản là gì?', 'Bạn thuê một ô kho riêng và tự sắp xếp, quản lý đồ đạc của mình.'],
  ...faqs,
  ['Tôi thanh toán tiền thuê như thế nào?', 'Sau khi ký hợp đồng theo quy trình đặt kho, bạn thanh toán hóa đơn qua VNPay.'],
]
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

function WarehousePlaceholder() {
  return <div className="landing-warehouse-placeholder"><Warehouse size={64} aria-hidden="true" /><span>Chưa có ảnh cơ sở</span></div>
}

export function LandingPage() {
  const { facilities, storageListings } = useCatalog()
  const area = (value?: string) => Number.parseFloat(value?.replace(',', '.') ?? '') || Infinity
  const products = [...storageListings].sort((a, b) => area(a.floorArea) - area(b.floorArea) || a.name.localeCompare(b.name, 'vi'))
  const introduction = products.find(product => product.image)

  return <div className="storage-home landing-premium">
    <section className="landing-hero" aria-labelledby="landing-title"><Container>
      <div className="landing-hero-layout">
        <div className="landing-intro">
          <h1 id="landing-title">Thêm không gian.<span>Thêm tự do.</span></h1>
          <p>Kho tự quản riêng, linh hoạt theo nhu cầu của bạn.</p>
          <a className="button-primary" href="#find-storage"><Search size={18} aria-hidden="true" /> Tìm kho phù hợp <ArrowRight size={18} aria-hidden="true" /></a>
        </div>
        <div className="landing-hero-media">
          <img src="/images/landing/nestbox-corridor.png" alt="Hành lang kho tự quản NestBox với các cửa cuốn xanh" width="1774" height="887" fetchPriority="high" />
        </div>
      </div>
      <div className="landing-finder" id="find-storage"><QuickFinder landing /></div>
    </Container></section>

    <section className="landing-section" id="sizes" aria-labelledby="landing-sizes"><Container>
      <header className="landing-section-heading"><div><h2 id="landing-sizes">Không gian phù hợp với bạn</h2><p>Lựa chọn kích thước kho phù hợp với nhu cầu lưu trữ.</p></div></header>
      {products.length ? <div className="landing-product-grid">
        {products.map(product => {
          const filters = new URLSearchParams({ size: product.sizeId, type: product.condition, duration: 'flexible' })
          if (product.facilityId) filters.set('facilityId', product.facilityId)
          return <article className="landing-product" key={product.id}>
            <StorageImage src={product.image} alt={product.image ? product.name : ''} loading="lazy" />
            <div className="landing-product-body">
              <span className="landing-step-icon"><Box size={21} aria-hidden="true" /></span>
              <div><h3>{product.name}</h3>
                <p>{[product.floorArea, product.dimensions, product.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'].filter(Boolean).join(' · ')}</p>
                {product.features.length > 0 && <p>{product.features.join(' · ')}</p>}
                {typeof product.monthlyPrice === 'number' && <p className="landing-price">{money.format(product.monthlyPrice)} / tháng</p>}
              </div>
            </div>
            <div className="landing-product-actions">
              <Link className="landing-text-link" to={'/storage?' + filters} aria-label={'Xem kho ' + product.name}>Xem kho <ArrowRight size={16} aria-hidden="true" /></Link>
              <ComparisonChoice product={product} />
            </div>
          </article>
        })}
      </div> : <p>Danh mục kho đang được cập nhật.</p>}
    </Container></section>

    <section className="landing-section" aria-labelledby="landing-benefits"><Container>
      <div className="landing-split">
        <div className="landing-intro-media">{introduction
          ? <StorageImage src={introduction.image} alt={introduction.name} loading="lazy" />
          : <WarehousePlaceholder />}</div>
        <div><h2 id="landing-benefits">Không gian riêng, bạn tự quản</h2>
          <p>Thuê ô kho riêng cho đồ cá nhân, gia đình hoặc hàng kinh doanh. Bạn chủ động sử dụng không gian theo nhu cầu.</p>
          <div className="landing-perks">{benefits.map(({ icon: Icon, title, text }) => <div key={title}>
            <span className="landing-step-icon"><Icon size={22} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p>
          </div>)}</div>
        </div>
      </div>
    </Container></section>

    <section className="landing-section" id="how-it-works" aria-labelledby="landing-steps"><Container>
      <div className="landing-timeline">
        <header><h2 id="landing-steps">Cách thuê kho tại NestBox</h2><p>Từ tìm kho đến nhận bàn giao.</p></header>
        <ol>{steps.map(({ icon: Icon, title, text }, index) => <li key={title}>
          <div className="landing-timeline-marker"><span>0{index + 1}</span><Icon size={21} aria-hidden="true" /></div>
          <h3>{title}</h3><p>{text}</p>
        </li>)}</ol>
      </div>
    </Container></section>

    {facilities.length > 0 && <section className="landing-section" id="facility" aria-labelledby="landing-facilities"><Container>
      <div className="landing-side-section">
        <header><h2 id="landing-facilities">Khám phá cơ sở NestBox</h2><p>Chọn cơ sở và xem các loại kho đang có.</p>
          {facilities.length > 1 && <Link className="landing-text-link" to="/facilities">Xem toàn bộ cơ sở <ArrowRight size={16} aria-hidden="true" /></Link>}
        </header>
        <div className={facilities.length === 1 ? 'landing-facilities single' : 'landing-facilities'}>
          {facilities.map(facility => {
            const names = [...new Set(products.filter(product => product.facilityId === facility.id).map(product => product.name))]
            return <article key={facility.id} className="landing-facility">
              <WarehousePlaceholder />
              <div><h3>{facility.name}</h3>
                {facility.address && <p><MapPin size={15} aria-hidden="true" /> {facility.address}</p>}
                {facility.officeHours && <p>Giờ văn phòng {facility.officeHours}</p>}
                {facility.accessHours && <p>Giờ vào kho {facility.accessHours}</p>}
                {names.length > 0 && <p>{names.join(' · ')}</p>}
                {facility.bookingEnabled && names.length > 0
                  ? <Link className="button-primary" to={'/storage?' + new URLSearchParams({ facilityId: facility.id, duration: 'flexible' })}>Xem kho tại cơ sở <ArrowRight size={16} aria-hidden="true" /></Link>
                  : <p>{facility.bookingEnabled ? 'Danh mục kho đang được cập nhật.' : 'Tạm dừng nhận đặt kho mới.'}</p>}
              </div>
            </article>
          })}
        </div>
      </div>
    </Container></section>}

    <section className="landing-section" id="faq" aria-labelledby="landing-faq"><Container>
      <div className="landing-side-section">
        <header><h2 id="landing-faq">Câu hỏi thường gặp</h2><p>Một số thắc mắc phổ biến khi thuê kho tại NestBox.</p></header>
        <div className="landing-faq-list">{questions.map(([question, answer]) => <details key={question}>
          <summary>{question}<ChevronDown size={17} aria-hidden="true" /></summary><p>{answer}</p>
        </details>)}</div>
      </div>
    </Container></section>

    <section className="landing-section" aria-labelledby="landing-final-title"><Container>
      <div className="landing-banner">
        <div><h2 id="landing-final-title">Sẵn sàng tạo thêm không gian?</h2><p>Tìm kho phù hợp với nhu cầu lưu trữ của bạn.</p></div>
        <Link className="button-primary" to="/storage?duration=flexible">Tìm kho ngay <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </Container></section>
  </div>
}

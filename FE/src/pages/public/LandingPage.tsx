import { ArrowRight, Box, CalendarDays, ChevronRight, ClipboardCheck, MapPin, PackageCheck, ReceiptText, Ruler, ShieldCheck, Snowflake, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import { ImageCredit } from '../../components/public/ImageCredit'
import { QuickFinder } from '../../components/public/QuickFinder'
import { StorageSizeCard } from '../../components/public/StorageSizeCard'
import { StorageImage } from '../../components/public/StorageImage'
import { ButtonLink } from '../../components/ui/ButtonLink'
import { Container } from '../../components/ui/Container'
import { faqs, imageCredits } from '../../data/storage'

export function LandingPage() {
  const { storageSizes, storageListings, approvedAddons } = useCatalog()
  return <div className="storage-home">
    <section className="storage-hero">
      <Container>
        <div className="storage-hero-copy">
          <span className="facility-chip"><MapPin size={14} /> Kho tự quản · Một cơ sở tại TP.HCM</span>
          <h1>Cất gọn đồ đạc.<br /><span>Rộng chỗ cho cuộc sống.</span></h1>
          <p>Từ vài chiếc vali đến hàng hóa kinh doanh. Chọn không gian vừa đủ,<br className="hidden sm:block" /> theo thời gian bạn cần, tại cơ sở NestBox.</p>
        </div>
        <div className="home-finder">
          <QuickFinder />
          <div className="home-finder-note"><span><CalendarDays size={14} /> Chọn ngày để kiểm tra khả dụng trong kỳ thuê</span><Link to="/size-guide">Chưa biết chọn cỡ nào? <ArrowRight size={14} /></Link></div>
        </div>
        <div className="home-size-shortcuts"><span><Ruler size={15} /> Chọn nhanh:</span>{storageSizes.map(size => <Link key={size.id} to={`/storage?size=${size.id}&type=all&duration=3`}>{size.name}<ChevronRight size={13} /></Link>)}</div>
      </Container>
    </section>
    <section className="home-section home-catalog"><Container>
      <div className="home-section-heading"><div><p className="eyebrow">Không gian của bạn tại NestBox</p><h2>Khám phá các loại kho</h2><p>Chọn theo sức chứa và điều kiện bảo quản. Kho thực tế được xác nhận theo lịch thuê.</p></div><Link className="home-text-link" to="/storage">Xem tất cả <ArrowRight size={17} /></Link></div>
      <div className="home-product-grid home-groups-grid">{storageSizes.map(size => <StorageSizeCard key={size.id} size={size} products={storageListings.filter(product => product.sizeId === size.id)} />)}</div>
    </Container></section>
    <section id="sizes" className="home-section home-soft-section"><Container>
      <div className="home-section-heading"><div><p className="eyebrow">Chọn vừa đủ, dùng thoải mái</p><h2>Đồ của bạn cần bao nhiêu chỗ?</h2><p>So sánh bằng diện tích và những vật dụng quen thuộc.</p></div><Link className="home-text-link" to="/size-guide">Khám phá kích thước <ArrowRight size={17} /></Link></div>
      <div className="home-size-grid">{storageSizes.map((size, index) => <Link key={size.id} className="home-size-card" to={`/size-guide?size=${size.id}`}><div className="home-size-card-top"><span className="home-size-icon"><Box size={24 + index * 4} strokeWidth={1.5} /></span><ArrowRight size={18} /></div><h3>{size.name}</h3><strong>{size.floorArea}</strong><p>{size.roomEquivalent}</p><span className="home-size-capacity">{size.boxCount}</span></Link>)}</div>
    </Container></section>
    <section id="amenities" className="home-section"><Container>
      <div className="home-section-heading"><div><p className="eyebrow">Phù hợp với đồ bạn gửi</p><h2>Hai điều kiện bảo quản</h2><p>Mỗi loại kho phục vụ một nhu cầu. So sánh trước khi lựa chọn.</p></div></div>
      <div className="home-condition-grid">
        <article className="home-condition-card"><span className="home-feature-icon"><Warehouse size={25} /></span><div><span className="eyebrow">Lưu trữ hằng ngày</span><h3>Kho tiêu chuẩn</h3><p>Cho thùng đồ, dụng cụ, nội thất bền và hàng hóa đóng gói thông thường.</p><Link className="home-text-link" to="/storage?type=standard&size=all&duration=3">Xem kho tiêu chuẩn <ArrowRight size={16} /></Link></div></article>
        <article className="home-condition-card is-climate"><span className="home-feature-icon"><Snowflake size={25} /></span><div><span className="eyebrow">Bảo quản có điều hòa</span><h3>Kho điều hòa</h3><p>Cho tài liệu, đồ điện tử, đồ gỗ và vật dụng cần môi trường ổn định hơn.</p><Link className="home-text-link" to="/storage?type=climate&size=all&duration=3">Xem kho điều hòa <ArrowRight size={16} /></Link></div></article>
      </div>
    </Container></section>
    <section id="how-it-works" className="home-section home-process-section"><Container>
      <div className="home-section-heading"><div><p className="eyebrow">Từng bước rõ ràng</p><h2>Từ chọn kho đến nhận bàn giao</h2><p>Gửi yêu cầu là bước bắt đầu. Việc thuê hoàn tất theo xác nhận, hợp đồng và thanh toán.</p></div></div>
      <div className="home-process-grid">{[
        { icon: Ruler, title: 'Chọn kho phù hợp', copy: 'So sánh kích thước, loại kho và kiểm tra lịch trống theo thời gian bạn cần.' },
        { icon: ClipboardCheck, title: 'Gửi yêu cầu', copy: 'Kiểm tra báo giá và thông tin liên hệ. Yêu cầu được gửi đến NestBox để xử lý.' },
        { icon: PackageCheck, title: 'Hoàn tất và nhận kho', copy: 'Sau xác nhận và thanh toán hóa đơn, đặt lịch bàn giao để bắt đầu sử dụng.' },
      ].map(({ icon: Icon, title, copy }, index) => <article key={title}><div className="home-process-number"><Icon size={22} /><span>0{index + 1}</span></div><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </Container></section>
    <section id="facility" className="home-section"><Container>
      <div className="home-facility"><figure><StorageImage src={imageCredits.warehouse.src} loading="lazy" alt="Ảnh minh họa không gian kho và các thùng hàng được sắp xếp trên kệ" /><ImageCredit label={imageCredits.warehouse.label} href={imageCredits.warehouse.href} /></figure><div className="home-facility-copy"><span className="facility-chip"><MapPin size={14} /> Một cơ sở · Nhiều lựa chọn lưu trữ</span><h2>Một nơi cho đồ đạc.<br />Thêm chỗ cho bạn.</h2><p>Chọn kho tại cơ sở NestBox theo lượng đồ và thời gian sử dụng. Theo dõi yêu cầu, hợp đồng, hóa đơn và hỗ trợ trong cùng một tài khoản.</p><div className="home-facility-benefits"><span><ShieldCheck size={18} /> Quyền truy cập riêng</span><span><ReceiptText size={18} /> Chi phí được thể hiện rõ</span><span><Box size={18} /> Nhiều nhóm kích thước</span></div><ButtonLink to="/storage">Tìm kho cho bạn <ArrowRight size={17} /></ButtonLink><small>Ảnh minh họa loại hình lưu trữ, không phải ảnh cơ sở NestBox thực tế.</small></div></div>
    </Container></section>
    {approvedAddons.length > 0 && <section className="home-section home-services"><Container><div className="home-section-heading"><div><p className="eyebrow">Theo nhu cầu của bạn</p><h2>Dịch vụ đi cùng việc lưu kho</h2><p>Chỉ tính phí cho lựa chọn được đưa vào báo giá của bạn.</p></div><Link to="/booking" className="home-text-link">Chọn khi đặt kho <ArrowRight size={17} /></Link></div><div className="home-service-grid">{(['PURCHASE', 'RENTAL'] as const).filter(kind => approvedAddons.some(service => service.kind === kind)).map(kind => <article key={kind}><span className="home-feature-icon"><Box size={21} /></span><div><h3>{kind === 'PURCHASE' ? 'Dịch vụ mua một lần' : 'Dịch vụ cho thuê'}</h3><p>{kind === 'PURCHASE' ? 'Chọn vật tư hoặc dịch vụ mua trong danh mục khi đặt kho.' : 'Chọn dịch vụ theo thời gian và số lượng bạn cần khi đặt kho.'}</p><Link className="home-text-link" to="/booking">Xem lựa chọn <ArrowRight size={15} /></Link></div></article>)}</div></Container></section>}
    <section id="faq" className="home-section home-faq"><Container><div className="home-section-heading"><div><p className="eyebrow">Trước khi bắt đầu</p><h2>Bạn hỏi, NestBox giải đáp</h2><p>Những thông tin giúp bạn chọn và sử dụng kho dễ hơn.</p><Link className="home-text-link" to="/size-guide">Xem hướng dẫn kích thước <ArrowRight size={17} /></Link></div><div className="home-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronRight size={18} /></summary><p>{answer}</p></details>)}</div></div></Container></section>
    <section className="home-bottom-cta"><Container><div><span className="eyebrow">Sẵn sàng cho một không gian gọn hơn?</span><h2>Bắt đầu từ chiếc kho vừa với bạn.</h2></div><ButtonLink to="/storage" variant="light">Khám phá kho NestBox <ArrowRight size={18} /></ButtonLink></Container></section>
  </div>
}

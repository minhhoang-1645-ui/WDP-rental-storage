import { ArrowLeft, Check, ReceiptText, ShieldCheck, Warehouse } from 'lucide-react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import { ComparisonChoice } from '../../components/public/StorageComparison'
import { StorageImage } from '../../components/public/StorageImage'
import { ButtonLink } from '../../components/ui/ButtonLink'
import { Container } from '../../components/ui/Container'
import { imageCredits } from '../../data/storage'
import { storageBookingHref, storageMonthlyPrice, storageSpecifications } from '../../utils/storage-selection'

const rentalCosts = [
  { icon: Warehouse, title: 'Tiền thuê', description: 'Theo loại kho, số lượng và thời gian thuê.' },
  { icon: ShieldCheck, title: 'Tiền đặt cọc', description: 'Tùy loại kho và kỳ thuê.' },
  { icon: ReceiptText, title: 'Dịch vụ bổ sung', description: 'Chỉ tính dịch vụ và vật tư bạn chọn.' },
]

export function StorageDetailPage() {
  const { getStorageListing, getStorageSize } = useCatalog()
  const { id } = useParams()
  const { search } = useLocation()
  const unit = getStorageListing(id)
  if (!unit) return <Navigate to="/storage" replace />

  const size = storageSpecifications(unit, getStorageSize(unit.sizeId)!)
  const hasPrice = typeof unit.monthlyPrice === 'number' && Number.isFinite(unit.monthlyPrice)
  const credit = Object.values(imageCredits).find(item => item.src === unit.image)
  const facts = [
    ['Kích thước', size.dimensions],
    ['Thể tích', size.volume],
    ['Loại kho', unit.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'],
    ['Vị trí', unit.floor || 'Xem khi xác nhận'],
    ['Truy cập kho', unit.access || 'Theo thỏa thuận khi bàn giao'],
    ['Kỳ thuê tối thiểu', unit.minRentalDays ? unit.minRentalDays + ' ngày' : 'Xem trong báo giá'],
    ['Tiền đặt cọc', typeof unit.depositMonths === 'number' ? unit.depositMonths + ' tháng tiền thuê' : 'Xem trong báo giá'],
    ['Thời hạn thuê', unit.allowDailyRental ? 'Theo tháng hoặc ngày' : 'Theo tháng'],
  ]

  return <div className="public-storage-detail">
    <header className="public-page-intro"><Container>
      <Link to={'/storage' + search} className="booking-back"><ArrowLeft size={17} aria-hidden="true" /> Danh sách kho</Link>
      <h1>{unit.name}</h1>
    </Container></header>

    <section className="public-page-content"><Container>
      <div className="storage-detail-layout">
        <figure className="storage-detail-figure">
          <StorageImage src={unit.image} alt={'Ảnh minh họa cho ' + unit.name} />
          <span className="illustration-label">Ảnh minh họa</span>
          {credit && <a href={credit.href} target="_blank" rel="noreferrer" className="image-credit">{credit.label}</a>}
        </figure>
        <div className="storage-detail-panel">
          <header className="storage-detail-summary">
            <span className={unit.status === 'limited' ? 'status-warning' : 'status-success'}>{unit.status === 'limited' ? 'Số lượng hạn chế' : 'Nhận yêu cầu'}</span>
            <small>{unit.code}</small>
          </header>
          <dl className="storage-detail-facts">
            {facts.map(([label, value]) => <div key={label} className="data-block"><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          {unit.features.length > 0 && <ul className="storage-detail-features" aria-label="Tiện ích">
            {unit.features.map(feature => <li key={feature}><Check size={16} aria-hidden="true" /> {feature}</li>)}
          </ul>}
          <div className="storage-detail-action">
            <div>
              <strong>{hasPrice ? storageMonthlyPrice(unit.monthlyPrice) + ' / tháng' : 'Xem báo giá'}</strong>
              {hasPrice && <p>Chưa gồm tiền cọc và dịch vụ.</p>}
            </div>
            <ButtonLink to={storageBookingHref(unit, search)}>Bắt đầu đặt kho</ButtonLink>
          </div>
          <ComparisonChoice product={unit} />
        </div>
      </div>
    </Container></section>

    <section className="storage-cost-section" aria-labelledby="storage-cost-title"><Container>
      <h2 id="storage-cost-title">Chi phí thuê kho</h2>
      <div className="storage-cost-grid">
        {rentalCosts.map(({ icon: Icon, title, description }) => <article className="storage-cost-card" key={title}>
          <span><Icon size={18} aria-hidden="true" /></span>
          <div><h3>{title}</h3><p>{description}</p></div>
        </article>)}
      </div>
    </Container></section>
  </div>
}

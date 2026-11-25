import { ArrowRight, Clock, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCatalog, type PublicFacility } from '../../catalog/catalog-context'
import { Container } from '../../components/ui/Container'

export function FacilitiesPage() {
  const { facilities } = useCatalog()

  return <>
    <header className="public-page-intro public-catalog-intro"><Container>
      <h1>Cơ sở NestBox</h1>
      <p>Xem địa chỉ, giờ hoạt động và các loại kho tại từng cơ sở.</p>
    </Container></header>
    <section className="public-page-content"><Container>
      {facilities.length === 0 ? <div className="storage-search-empty"><h2>Chưa có cơ sở được công bố</h2></div> : <FacilityCards facilities={facilities} />}
    </Container></section>
  </>
}

export function FacilityCards({ facilities, compact = false }: { facilities: PublicFacility[]; compact?: boolean }) {
  const { storageListings } = useCatalog()
  return <div className="facility-directory">
    {facilities.map(facility => {
      const types = storageListings.filter(product => product.facilityId === facility.id)
      const typeNames = [...new Set(types.map(product => product.name))]
      return <article className="facility-directory-card" key={facility.id}>
        <div className="facility-directory-heading">
          <span className="landing-step-icon"><MapPin size={21} aria-hidden="true" /></span>
          <div>
            <h2>{facility.name}</h2>
            {facility.address?.trim() && <p>{facility.address}</p>}
            {!compact && types.length > 0 && <p className="facility-summary">{types.length} loại kho để lựa chọn theo kỳ thuê.</p>}
          </div>
        </div>
        {!compact && <div className="facility-schedule">
          <Clock size={17} aria-hidden="true" />
          <dl>
            <div><dt>Giờ văn phòng</dt><dd>{facility.officeHours?.trim() || 'Chưa công bố'}</dd></div>
            <div><dt>Giờ vào kho</dt><dd>{facility.accessHours?.trim() || 'Chưa công bố'}</dd></div>
          </dl>
        </div>}
        {typeNames.length > 0 && <div className="facility-types">
          <h3>Loại kho tại cơ sở</h3>
          <ul>{typeNames.map(type => <li key={type}>{type}</li>)}</ul>
        </div>}
        {facility.bookingEnabled
          ? typeNames.length > 0
            ? <Link className="landing-text-link" to={`/storage?${new URLSearchParams({ facilityId: facility.id })}`} aria-label={`Xem kho tại ${facility.name}`}>Xem kho tại cơ sở <ArrowRight size={16} aria-hidden="true" /></Link>
            : <p>Chưa có loại kho được công bố.</p>
          : <p className="facility-directory-paused">Tạm dừng nhận đặt kho mới</p>}
      </article>
    })}
  </div>
}

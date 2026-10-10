import { ArrowLeft, HardHat, RefreshCw, Warehouse } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useApiResource } from '../../services/useApiResource'
import type { ManagerUnitDetail } from '../../types/manager'

export function ManagerUnitDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data: unit, error, loading, refresh } = useApiResource<ManagerUnitDetail>(
    id ? `/manager/units/${encodeURIComponent(id)}` : null,
    user?.id ?? ''
  )

  if (loading) return <p role="status">Đang tải thông tin kho vật lý…</p>
  if (error || !unit) {
    return (
      <div className="booking-alert is-error" role="alert">
        {error || 'Không tìm thấy thông tin kho vật lý.'}
        <button onClick={refresh}>Thử lại</button>
      </div>
    )
  }

  const current = unit.currentAllocation
  const future = unit.futureAllocations ?? []
  const history = unit.allocations ?? []

  return (
    <section>
      <Link className="booking-back" to="/manager/units">
        <ArrowLeft size={16} /> Danh sách kho vật lý
      </Link>
      <header className="manager-detail-header">
        <div>
          <p className="eyebrow">Kho vật lý · {unit.storageType.name}</p>
          <h1>{unit.unitCode}</h1>
          <p>{unit.dimensions.display} · {unit.condition}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className={`manager-status is-${unit.status.toLowerCase()}`}>{unit.status}</span>
          <button className="button-secondary" onClick={refresh} title="Làm mới">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <div className="manager-detail-grid">
        <div className="manager-detail-content">
          <section className="manager-section">
            <h2>Vị trí & Thông số kỹ thuật</h2>
            <dl className="manager-facts">
              <div>
                <dt>Loại kho</dt>
                <dd>{unit.storageType.name} ({unit.storageType.code})</dd>
              </div>
              <div>
                <dt>Phân loại cỡ</dt>
                <dd>{unit.category.name}</dd>
              </div>
              <div>
                <dt>Kích thước</dt>
                <dd>{unit.dimensions.display}</dd>
              </div>
              <div>
                <dt>Điều kiện</dt>
                <dd>{unit.condition}</dd>
              </div>
              <div>
                <dt>Vị trí</dt>
                <dd>{[unit.floor, unit.zone ? `Zone ${unit.zone}` : null].filter(Boolean).join(' · ') || 'Chưa cập nhật'}</dd>
              </div>
              <div>
                <dt>Hàng / Vị trí</dt>
                <dd>{unit.row !== null && unit.position !== null ? `Hàng ${unit.row}, Ô ${unit.position}` : 'Chưa xếp'}</dd>
              </div>
            </dl>
          </section>

          <section className="manager-section">
            <h2>Khách đang thuê hiện tại</h2>
            {current ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                <p>
                  <strong>Khách hàng:</strong> {current.customer.fullName} ({current.customer.email})
                </p>
                <p>
                  <strong>Reservation:</strong>{' '}
                  <Link to={`/manager/reservations/${current.reservationReference}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                    {current.reservationReference}
                  </Link>
                </p>
                <p>
                  <strong>Thời gian thuê:</strong> {current.startDate} đến {current.endDate}
                </p>
              </div>
            ) : (
              <p style={{ color: 'var(--color-slate)' }}>Kho hiện tại không có khách đang sử dụng.</p>
            )}
          </section>

          <section className="manager-section">
            <h2>Lịch đặt trước tương lai ({future.length})</h2>
            {future.length > 0 ? (
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <thead>
                    <tr>
                      <th>Reservation</th>
                      <th>Khách hàng</th>
                      <th>Kỳ thuê</th>
                    </tr>
                  </thead>
                  <tbody>
                    {future.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <Link to={`/manager/reservations/${f.reservationReference}`} style={{ fontWeight: 700, color: 'var(--color-navy)' }}>
                            {f.reservationReference}
                          </Link>
                        </td>
                        <td>{f.customer.fullName}</td>
                        <td>{f.startDate} đến {f.endDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--color-slate)' }}>Không có lịch đặt trước nào trong tương lai.</p>
            )}
          </section>

          <section className="manager-section">
            <h2>Lịch sử phân bổ ({history.length})</h2>
            {history.length > 0 ? (
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <thead>
                    <tr>
                      <th>Reservation</th>
                      <th>Khách hàng</th>
                      <th>Kỳ phân bổ</th>
                      <th>Ngày giải phóng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <Link to={`/manager/reservations/${h.reservationReference}`} style={{ fontWeight: 700, color: 'var(--color-navy)' }}>
                            {h.reservationReference}
                          </Link>
                        </td>
                        <td>{h.customer.fullName}</td>
                        <td>{h.startDate} đến {h.endDate}</td>
                        <td>{h.releasedAt ? new Date(h.releasedAt).toLocaleDateString('vi-VN') : 'Đang giữ'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--color-slate)' }}>Chưa có lịch sử phân bổ nào.</p>
            )}
          </section>
        </div>

        <aside className="manager-processing">
          <h2>Tình trạng vận hành</h2>
          {unit.activeMaintenance ? (
            <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '8px', border: '1px solid #fde047', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#854d0e', fontWeight: 700 }}>
                <HardHat size={18} /> Đang bảo trì
              </div>
              <p style={{ marginTop: '8px', fontSize: '13px' }}>
                Mã: <strong>{unit.activeMaintenance.maintenanceCode}</strong>
              </p>
              <p style={{ fontSize: '13px' }}>
                Ưu tiên: <strong>{unit.activeMaintenance.priority}</strong> · Trạng thái: <strong>{unit.activeMaintenance.status}</strong>
              </p>
              <Link
                to={`/manager/operations/maintenance/${unit.activeMaintenance.id}`}
                className="button-secondary"
                style={{ marginTop: '12px', width: '100%', justifyContent: 'center' }}
              >
                Mở case bảo trì
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', background: '#dcfce7', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontWeight: 700 }}>
              <Warehouse size={18} /> Kho không có sự cố bảo trì
            </div>
          )}

          <div style={{ display: 'grid', gap: '10px' }}>
            <Link
              to="/manager/operations/maintenance"
              className="button-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Xem danh mục bảo trì
            </Link>
            <Link
              to="/manager/reservations"
              className="button-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Xem yêu cầu Reservation
            </Link>
          </div>
        </aside>
      </div>
    </section>
  )
}

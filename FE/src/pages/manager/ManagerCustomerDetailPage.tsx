import { ArrowLeft, ArrowRight, Mail, Phone, RefreshCw, UserCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useApiResource } from '../../services/useApiResource'
import type { ManagerCustomerDetail } from '../../types/manager'

export function ManagerCustomerDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data: customer, error, loading, refresh } = useApiResource<ManagerCustomerDetail>(
    id ? `/manager/customers/${encodeURIComponent(id)}` : null,
    user?.id ?? ''
  )

  if (loading) return <p role="status">Đang tải thông tin khách hàng…</p>
  if (error || !customer) {
    return (
      <div className="booking-alert is-error" role="alert">
        {error || 'Không tìm thấy khách hàng.'}
        <button onClick={refresh}>Thử lại</button>
      </div>
    )
  }

  const reservations = customer.reservations ?? []

  return (
    <section>
      <Link className="booking-back" to="/manager/customers">
        <ArrowLeft size={16} /> Danh bạ khách hàng
      </Link>
      <header className="manager-detail-header">
        <div>
          <p className="eyebrow">Hồ sơ khách hàng · CUSTOMER</p>
          <h1>{customer.fullName}</h1>
          <p>Tài khoản tạo ngày {new Date(customer.createdAt).toLocaleDateString('vi-VN')}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className={`manager-status is-${customer.accountStatus.toLowerCase()}`}>{customer.accountStatus}</span>
          <button className="button-secondary" onClick={refresh} title="Làm mới">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <div className="manager-detail-grid">
        <div className="manager-detail-content">
          <section className="manager-section">
            <h2>Thông tin liên hệ</h2>
            <div className="manager-contact">
              {customer.phone ? (
                <a href={`tel:${customer.phone}`}>
                  <Phone size={17} /> {customer.phone}
                </a>
              ) : (
                <span style={{ color: 'var(--color-slate)' }}>Chưa cập nhật số điện thoại</span>
              )}
              <a href={`mailto:${customer.email}`}>
                <Mail size={17} /> {customer.email}
              </a>
            </div>
          </section>

          <section className="manager-section">
            <h2>Lịch sử đặt kho ({reservations.length})</h2>
            {reservations.length > 0 ? (
              <div style={{ display: 'grid', gap: '16px' }}>
                {reservations.map((res) => (
                  <article
                    key={res.id}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      padding: '16px',
                      background: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <strong>{res.reference}</strong>
                        <p style={{ fontSize: '13px', color: 'var(--color-slate)', marginTop: '2px' }}>
                          {res.storageType.name} · {res.quantity} kho · Tạo {new Date(res.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className={`manager-status is-${res.status.toLowerCase()}`}>{res.status}</span>
                        <Link
                          to={`/manager/reservations/${res.id}`}
                          className="manager-open"
                          title="Mở chi tiết Reservation"
                        >
                          <ArrowRight size={16} />
                        </Link>
                      </div>
                    </div>

                    <p style={{ fontSize: '13px', marginBottom: '8px' }}>
                      <strong>Thời gian:</strong> {res.startDate} đến {res.endDate}
                    </p>

                    {res.allocatedUnits && res.allocatedUnits.length > 0 && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-slate)', textTransform: 'uppercase' }}>
                          Kho vật lý được gán:
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                          {res.allocatedUnits.map((u) => (
                            <Link
                              key={u.unitId}
                              to={`/manager/units/${encodeURIComponent(u.unitCode)}`}
                              style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                background: 'white',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                fontSize: '13px',
                                color: 'var(--color-navy)',
                                fontWeight: 700,
                              }}
                            >
                              {u.unitCode} {u.releasedAt ? '(Đã trả)' : ''}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--color-slate)' }}>Khách hàng chưa có yêu cầu đặt kho nào.</p>
            )}
          </section>
        </div>

        <aside className="manager-processing">
          <h2>Tóm tắt tài khoản</h2>
          <dl className="manager-facts" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
            <div>
              <dt>Trạng thái</dt>
              <dd>
                <UserCheck size={16} /> {customer.accountStatus}
              </dd>
            </div>
            <div>
              <dt>Tổng lượt đặt kho</dt>
              <dd>{customer.reservationCount}</dd>
            </div>
            <div>
              <dt>Cập nhật lần cuối</dt>
              <dd>{new Date(customer.updatedAt).toLocaleDateString('vi-VN')}</dd>
            </div>
          </dl>

          <div style={{ marginTop: '20px', display: 'grid', gap: '10px' }}>
            <Link
              to="/manager/operations/invoices"
              className="button-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Xem hóa đơn liên quan
            </Link>
            <Link
              to="/manager/operations/contracts"
              className="button-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Xem hợp đồng liên quan
            </Link>
          </div>
        </aside>
      </div>
    </section>
  )
}

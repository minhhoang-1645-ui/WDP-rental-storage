import { ArrowLeft, Check, Mail, Phone, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { managerApi } from '../../services/booking'
import { useApiResource } from '../../services/useApiResource'
import type { ManagerInquiry } from '../../types/booking'

export function ManagerReservationDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data, error, loading, refresh } = useApiResource<ManagerInquiry>(
    id ? '/manager/reservations/' + encodeURIComponent(id) : null,
    user?.id ?? ''
  )
  const [updated, setUpdated] = useState<ManagerInquiry | null>(null)
  const [saving, setSaving] = useState<'CONFIRMED' | 'REJECTED' | null>(null)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  const reservation = updated ?? data

  const updateStatus = async (status: 'CONFIRMED' | 'REJECTED') => {
    setSaving(status)
    setSaveError('')
    setSaveSuccess('')
    try {
      const result = await managerApi.updateReservationStatus(id, status)
      setUpdated(result)
      setSaveSuccess(
        status === 'CONFIRMED'
          ? 'Đã xác nhận và phân bổ đủ kho vật lý thành công!'
          : 'Đã từ chối yêu cầu đặt kho.'
      )
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Không thể cập nhật Reservation.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p role="status">Đang tải Reservation…</p>
  if (error || !reservation) {
    return (
      <div className="booking-alert is-error" role="alert">
        {error || 'Không tìm thấy Reservation.'}
        <button onClick={refresh}>Thử lại</button>
      </div>
    )
  }

  const canDecide = reservation.status === 'PENDING'
  const units = reservation.allocatedUnits ?? []

  const formatVnd = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return 'Cần báo giá'
    return new Intl.NumberFormat('vi-VN').format(amount) + ' đ'
  }

  return (
    <section>
      <Link className="booking-back" to="/manager/reservations">
        <ArrowLeft size={16} /> Danh sách Reservation
      </Link>
      <header className="manager-detail-header">
        <div>
          <p className="eyebrow">{reservation.reference} · Chi tiết đặt kho</p>
          <h1>{reservation.customer.fullName}</h1>
          <p>Tạo lúc {new Date(reservation.createdAt).toLocaleString('vi-VN')}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className={'manager-status is-' + reservation.status.toLowerCase()}>{reservation.status}</span>
          <button className="button-secondary" onClick={refresh} title="Làm mới">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {saveError && <div className="booking-alert is-error" style={{ marginBottom: '20px' }}>{saveError}</div>}
      {saveSuccess && (
        <div
          className="booking-alert"
          style={{ marginBottom: '20px', background: '#dcfce7', borderColor: '#86efac', color: '#166534' }}
        >
          {saveSuccess}
        </div>
      )}

      <div className="manager-detail-grid">
        <div className="manager-detail-content">
          <section className="manager-section">
            <h2>Thông tin khách hàng</h2>
            <div className="manager-contact">
              {reservation.customer.phone ? (
                <a href={'tel:' + reservation.customer.phone}>
                  <Phone size={17} /> {reservation.customer.phone}
                </a>
              ) : (
                <span style={{ color: 'var(--color-slate)' }}>Chưa có SĐT</span>
              )}
              {reservation.customer.email && (
                <a href={'mailto:' + reservation.customer.email}>
                  <Mail size={17} /> {reservation.customer.email}
                </a>
              )}
            </div>
          </section>

          <section className="manager-section">
            <h2>Nhu cầu lưu trữ</h2>
            <dl className="manager-facts">
              <div>
                <dt>Sản phẩm kho</dt>
                <dd>
                  <strong>{reservation.product.name}</strong> ({reservation.product.code})
                </dd>
              </div>
              <div>
                <dt>Số lượng yêu cầu</dt>
                <dd>{reservation.quantity} kho</dd>
              </div>
              <div>
                <dt>Kỳ thuê dự kiến</dt>
                <dd>
                  {reservation.startDate} đến {reservation.endDateExclusive}
                </dd>
              </div>
              <div>
                <dt>Ưu tiên liền kề</dt>
                <dd>{reservation.adjacencyPreference ? 'Có yêu cầu' : 'Không yêu cầu'}</dd>
              </div>
            </dl>
          </section>

          {/* QUOTE BREAKDOWN */}
          {reservation.quote?.lineItems && reservation.quote.lineItems.length > 0 && (
            <section className="manager-section">
              <h2>Báo giá dự kiến tại thời điểm gửi</h2>
              <div className="manager-quote">
                {reservation.quote.lineItems.map((line) => (
                  <div key={line.code}>
                    <span>
                      <strong>{line.label}</strong>
                      <small>{line.basis}</small>
                    </span>
                    <strong>{formatVnd(line.amount)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="manager-section">
            <h2>Kho vật lý được phân bổ</h2>
            {units.length > 0 ? (
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <thead>
                    <tr>
                      <th>Mã kho</th>
                      <th>Vị trí</th>
                      <th>Trạng thái vật lý</th>
                      <th><span className="sr-only">Xem</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((unit) => (
                      <tr key={unit.unitNumber}>
                        <td>
                          <strong>{unit.unitNumber}</strong>
                        </td>
                        <td>{[unit.floor, unit.zone].filter(Boolean).join(' · ') || 'Tầng 1'}</td>
                        <td>
                          <span className="manager-status is-confirmed">{unit.physicalStatus}</span>
                        </td>
                        <td>
                          <Link
                            to={`/manager/units/${encodeURIComponent(unit.unitNumber)}`}
                            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-navy)' }}
                          >
                            Chi tiết kho →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--color-slate)' }}>
                Chưa phân bổ. Khi Manager xác nhận, backend sẽ tự động kiểm tra tồn kho vật lý và khóa phân bổ toàn
                bộ {reservation.quantity} unit trong một transaction an toàn.
              </p>
            )}
          </section>
        </div>

        <aside className="manager-processing">
          <h2>Xử lý Reservation</h2>
          {canDecide ? (
            <>
              <p className="manager-action-copy">
                Xác nhận sẽ yêu cầu backend khóa và phân bổ đủ {reservation.quantity} kho. Nếu không đủ tồn kho,
                toàn bộ thao tác sẽ bị rollback và Reservation giữ nguyên trạng thái chờ xử lý.
              </p>
              <button
                className="button-primary w-full justify-center"
                onClick={() => updateStatus('CONFIRMED')}
                disabled={saving !== null}
              >
                <Check size={17} /> {saving === 'CONFIRMED' ? 'Đang xác nhận…' : 'Xác nhận & phân bổ kho'}
              </button>
              <button
                className="button-secondary manager-action-secondary"
                onClick={() => updateStatus('REJECTED')}
                disabled={saving !== null}
              >
                <X size={17} /> {saving === 'REJECTED' ? 'Đang từ chối…' : 'Từ chối yêu cầu'}
              </button>
            </>
          ) : (
            <div>
              <p className="manager-action-copy">
                Reservation đang ở trạng thái <strong>{reservation.status}</strong>.
              </p>
              {reservation.status === 'CONFIRMED' && (
                <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                  <Link
                    to="/manager/operations/invoices"
                    className="button-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Xem hóa đơn đợt 1
                  </Link>
                  <Link
                    to="/manager/operations/appointments"
                    className="button-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Kiểm tra lịch bàn giao
                  </Link>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

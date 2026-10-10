import { ArrowLeft, Check, RefreshCw, X, Wrench, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { managerOpsApi } from '../../services/manager'
import { useApiResource } from '../../services/useApiResource'

export function ManagerResourceDetailPage() {
  const { resource = '', id = '' } = useParams()
  const { user } = useAuth()

  // Endpoint mapping
  const getEndpoint = () => {
    if (!id || !resource) return null
    if (resource === 'rentals') return `/manager/rentals/${encodeURIComponent(id)}`
    return `/manager/${resource}/${encodeURIComponent(id)}`
  }

  const { data: item, error, loading, refresh } = useApiResource<any>(getEndpoint(), user?.id ?? '')

  // Action states
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  // Form drafts
  const [rejectReason, setRejectReason] = useState('')
  const [payAmount, setPayAmount] = useState<number | ''>('')
  const [payMethod, setPayMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER')
  const [payRef, setPayRef] = useState('')
  const [payNote, setPayNote] = useState('')

  // Maintenance drafts
  const [mStaffId, setMStaffId] = useState('')
  const [mPriority, setMPriority] = useState('MEDIUM')
  const [mVerifyNote, setMVerifyNote] = useState('')
  const [mRejectNote, setMRejectNote] = useState('')

  // Support drafts
  const [sStaffId, setSStaffId] = useState('')
  const [sPriority, setSPriority] = useState('MEDIUM')
  const [sResType, setSResType] = useState('MANAGER_RESOLVED')
  const [sResNote, setSResNote] = useState('')

  // Transfer drafts
  const [destUnitId, setDestUnitId] = useState('')

  // Deposit Settlement drafts
  const [refundMethod, setRefundMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER')
  const [refundRef, setRefundRef] = useState('')
  const [refundNote, setRefundNote] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [issueCharges, setIssueCharges] = useState<Record<string, { amount: number; type: string; reason: string }>>({})

  const runAction = async (fn: () => Promise<any>, successMsg: string) => {
    setActing(true)
    setActionError('')
    setActionSuccess('')
    try {
      await fn()
      setActionSuccess(successMsg)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Thao tác thất bại.')
    } finally {
      setActing(false)
    }
  }

  if (loading) return <p role="status">Đang tải thông tin chi tiết…</p>
  if (error || !item) {
    return (
      <div className="booking-alert is-error" role="alert">
        {error || 'Không tìm thấy dữ liệu.'}
        <button onClick={refresh}>Thử lại</button>
      </div>
    )
  }

  const formatVnd = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return '0 đ'
    return new Intl.NumberFormat('vi-VN').format(Number(val)) + ' đ'
  }

  return (
    <section>
      <Link className="booking-back" to={`/manager/operations/${resource}`}>
        <ArrowLeft size={16} /> Quay lại danh sách
      </Link>

      <header className="manager-detail-header">
        <div>
          <p className="eyebrow">Quản lý vận hành · {resource.toUpperCase()}</p>
          <h1>
            {item.appointmentCode ||
              item.renewalCode ||
              item.invoiceCode ||
              item.paymentCode ||
              item.contractCode ||
              item.returnCode ||
              item.transferCode ||
              item.maintenanceCode ||
              item.supportCode ||
              item.settlementCode ||
              item.reservationReference ||
              id}
          </h1>
          <p>Cập nhật trực tiếp theo thời gian thực.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {item.status && <span className={`manager-status is-${String(item.status).toLowerCase()}`}>{item.status}</span>}
          {item.rentalState && <span className={`manager-status is-${String(item.rentalState).toLowerCase()}`}>{item.rentalState}</span>}
          <button className="button-secondary" onClick={refresh} title="Làm mới">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {actionError && <div className="booking-alert is-error" style={{ marginBottom: '20px' }}>{actionError}</div>}
      {actionSuccess && <div className="booking-alert" style={{ marginBottom: '20px', background: '#dcfce7', borderColor: '#86efac', color: '#166534' }}>{actionSuccess}</div>}

      <div className="manager-detail-grid">
        <div className="manager-detail-content">

          {/* ==================== 1. APPOINTMENTS ==================== */}
          {resource === 'appointments' && (
            <>
              <section className="manager-section">
                <h2>Thông tin lịch bàn giao</h2>
                <dl className="manager-facts">
                  <div>
                    <dt>Thời gian bàn giao</dt>
                    <dd>{new Date(item.scheduledAt).toLocaleString('vi-VN')}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>{item.status}</dd>
                  </div>
                  <div>
                    <dt>Khách hàng</dt>
                    <dd>{item.reservation?.customer?.fullName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Liên hệ</dt>
                    <dd>{item.reservation?.customer?.phone || item.reservation?.customer?.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Reservation</dt>
                    <dd>
                      <Link to={`/manager/reservations/${item.reservation?.reference || item.reservation?.id}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                        {item.reservation?.reference || item.reservation?.id}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Số kho bàn giao</dt>
                    <dd>{item.reservation?.quantity || item.reservation?.contractCount || 1} kho</dd>
                  </div>
                </dl>
                {item.note && (
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--color-slate)' }}>Ghi chú của khách:</p>
                    <p style={{ marginTop: '4px', fontStyle: 'italic' }}>{item.note}</p>
                  </div>
                )}
              </section>

              {item.reservation?.contracts && item.reservation.contracts.length > 0 && (
                <section className="manager-section">
                  <h2>Hợp đồng & Kho phân bổ</h2>
                  <div className="manager-table-wrap">
                    <table className="manager-table">
                      <thead>
                        <tr>
                          <th>Hợp đồng</th>
                          <th>Kho vật lý</th>
                          <th>Trạng thái hợp đồng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.reservation.contracts.map((c: any) => (
                          <tr key={c.id}>
                            <td><strong>{c.contractCode}</strong></td>
                            <td>
                              {c.reservationUnit?.storageUnit?.unitNumber ? (
                                <Link to={`/manager/units/${c.reservationUnit.storageUnit.unitNumber}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                                  {c.reservationUnit.storageUnit.unitNumber} ({c.reservationUnit.storageUnit.floor || 'Chưa rõ tầng'})
                                </Link>
                              ) : (
                                'Chưa gán'
                              )}
                            </td>
                            <td><span className="manager-status">{c.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ==================== 2. RENEWALS ==================== */}
          {resource === 'renewals' && (
            <>
              <section className="manager-section">
                <h2>Yêu cầu gia hạn hợp đồng</h2>
                <dl className="manager-facts">
                  <div>
                    <dt>Mã gia hạn</dt>
                    <dd>{item.renewalCode}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>{item.status}</dd>
                  </div>
                  <div>
                    <dt>Ngày kết thúc hiện tại</dt>
                    <dd>{item.previousEndDate}</dd>
                  </div>
                  <div>
                    <dt>Ngày kết thúc mới yêu cầu</dt>
                    <dd style={{ color: 'var(--color-navy)', fontWeight: 800 }}>{item.requestedEndDate}</dd>
                  </div>
                  <div>
                    <dt>Số tháng gia hạn</dt>
                    <dd>{item.termMonths} tháng</dd>
                  </div>
                  <div>
                    <dt>Phương thức thanh toán mới</dt>
                    <dd>{item.paymentPlan}</dd>
                  </div>
                </dl>
                {item.rejectionReason && (
                  <div style={{ marginTop: '16px', background: '#fee2e2', padding: '12px', borderRadius: '6px' }}>
                    <p style={{ color: '#991b1b', fontWeight: 700 }}>Lý do từ chối:</p>
                    <p style={{ color: '#991b1b', marginTop: '4px' }}>{item.rejectionReason}</p>
                  </div>
                )}
              </section>

              {item.invoices && item.invoices.length > 0 && (
                <section className="manager-section">
                  <h2>Hóa đơn gia hạn tự động ({item.invoices.length})</h2>
                  <div className="manager-table-wrap">
                    <table className="manager-table">
                      <thead>
                        <tr>
                          <th>Mã hóa đơn</th>
                          <th>Kỳ thanh toán</th>
                          <th>Tổng tiền</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.invoices.map((inv: any) => (
                          <tr key={inv.id}>
                            <td>
                              <Link to={`/manager/operations/invoices/${inv.invoiceCode || inv.id}`} style={{ fontWeight: 700, color: 'var(--color-navy)' }}>
                                {inv.invoiceCode}
                              </Link>
                            </td>
                            <td>{inv.billingPeriodStart} đến {inv.billingPeriodEnd}</td>
                            <td>{formatVnd(inv.totalAmount)}</td>
                            <td><span className="manager-status">{inv.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ==================== 3. INVOICES ==================== */}
          {resource === 'invoices' && (
            <>
              <section className="manager-section">
                <h2>Chi tiết hóa đơn</h2>
                <dl className="manager-facts">
                  <div>
                    <dt>Mã hóa đơn</dt>
                    <dd>{item.invoiceCode}</dd>
                  </div>
                  <div>
                    <dt>Loại hóa đơn</dt>
                    <dd>{item.type}</dd>
                  </div>
                  <div>
                    <dt>Hạn thanh toán (Due Date)</dt>
                    <dd style={{ color: item.isPastDue ? '#dc2626' : 'inherit' }}>
                      {item.dueAt || 'Không có'} {item.isPastDue ? '(Quá hạn)' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Khách hàng</dt>
                    <dd>{item.reservation?.customer?.fullName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Kỳ thuê</dt>
                    <dd>{item.billingPeriodStart} đến {item.billingPeriodEnd}</dd>
                  </div>
                  <div>
                    <dt>Reservation liên quan</dt>
                    <dd>
                      <Link to={`/manager/reservations/${item.reservation?.reference || item.reservation?.id}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                        {item.reservation?.reference || item.reservation?.id}
                      </Link>
                    </dd>
                  </div>
                </dl>

                <div className="manager-quote" style={{ marginTop: '20px' }}>
                  <div>
                    <span><strong>Tiền thuê kho</strong></span>
                    <strong>{formatVnd(item.rentalAmount)}</strong>
                  </div>
                  <div>
                    <span><strong>Tiền đặt cọc</strong></span>
                    <strong>{formatVnd(item.depositAmount)}</strong>
                  </div>
                  {item.chargeAmount > 0 && (
                    <div>
                      <span><strong>Phí phát sinh / Khấu trừ</strong></span>
                      <strong style={{ color: '#dc2626' }}>{formatVnd(item.chargeAmount)}</strong>
                    </div>
                  )}
                  <div>
                    <span><strong>Tổng số tiền</strong></span>
                    <strong style={{ fontSize: '18px', color: 'var(--color-navy)' }}>{formatVnd(item.totalAmount)}</strong>
                  </div>
                  <div>
                    <span><strong>Đã thanh toán</strong></span>
                    <strong style={{ color: '#166534' }}>{formatVnd(item.amountPaid)}</strong>
                  </div>
                  <div>
                    <span><strong>Số dư còn phải trả</strong></span>
                    <strong style={{ fontSize: '18px', color: item.balanceDue > 0 ? '#dc2626' : '#166534' }}>{formatVnd(item.balanceDue)}</strong>
                  </div>
                </div>
              </section>

              {item.payments && item.payments.length > 0 && (
                <section className="manager-section">
                  <h2>Lịch sử thanh toán đã ghi nhận ({item.payments.length})</h2>
                  <div className="manager-table-wrap">
                    <table className="manager-table">
                      <thead>
                        <tr>
                          <th>Mã giao dịch</th>
                          <th>Số tiền</th>
                          <th>Phương thức</th>
                          <th>Thời gian</th>
                          <th>Người ghi nhận</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.payments.map((p: any) => (
                          <tr key={p.id}>
                            <td><strong>{p.paymentCode}</strong><small>{p.reference || 'Không có mã ref'}</small></td>
                            <td style={{ color: '#166534', fontWeight: 700 }}>{formatVnd(p.amount)}</td>
                            <td>{p.method}</td>
                            <td>{new Date(p.receivedAt).toLocaleString('vi-VN')}</td>
                            <td>{p.recordedBy?.fullName || 'Hệ thống'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ==================== 4. PAYMENTS ==================== */}
          {resource === 'payments' && (
            <section className="manager-section">
              <h2>Chi tiết thanh toán</h2>
              <dl className="manager-facts">
                <div>
                  <dt>Mã thanh toán</dt>
                  <dd>{item.paymentCode}</dd>
                </div>
                <div>
                  <dt>Số tiền</dt>
                  <dd style={{ fontSize: '18px', color: '#166534', fontWeight: 800 }}>{formatVnd(item.amount)}</dd>
                </div>
                <div>
                  <dt>Phương thức</dt>
                  <dd>{item.method}</dd>
                </div>
                <div>
                  <dt>Mã tham chiếu ngân hàng</dt>
                  <dd>{item.reference || 'Không có'}</dd>
                </div>
                <div>
                  <dt>Thời gian nhận</dt>
                  <dd>{new Date(item.receivedAt).toLocaleString('vi-VN')}</dd>
                </div>
                <div>
                  <dt>Người ghi nhận</dt>
                  <dd>{item.recordedBy?.fullName || 'Hệ thống'} ({item.recordedBy?.role || ''})</dd>
                </div>
                <div>
                  <dt>Hóa đơn liên quan</dt>
                  <dd>
                    {item.invoice?.invoiceCode ? (
                      <Link to={`/manager/operations/invoices/${item.invoice.invoiceCode}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                        {item.invoice.invoiceCode}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
              {item.note && (
                <div style={{ marginTop: '16px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--color-slate)' }}>Ghi chú:</p>
                  <p style={{ marginTop: '4px' }}>{item.note}</p>
                </div>
              )}
            </section>
          )}

          {/* ==================== 5. CONTRACTS ==================== */}
          {resource === 'contracts' && (
            <section className="manager-section">
              <h2>Thông tin hợp đồng</h2>
              <dl className="manager-facts">
                <div>
                  <dt>Mã hợp đồng</dt>
                  <dd>{item.contractCode}</dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{item.status}</dd>
                </div>
                <div>
                  <dt>Khách hàng</dt>
                  <dd>{item.reservation?.customer?.fullName || '—'}</dd>
                </div>
                <div>
                  <dt>Kho vật lý</dt>
                  <dd>
                    {item.storageUnit?.unitCode ? (
                      <Link to={`/manager/units/${item.storageUnit.unitCode}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                        {item.storageUnit.unitCode} ({[item.storageUnit.floor, item.storageUnit.zone].filter(Boolean).join(' · ')})
                      </Link>
                    ) : (
                      'Chưa gán'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Ngày bắt đầu</dt>
                  <dd>{item.startDate}</dd>
                </div>
                <div>
                  <dt>Ngày kết thúc</dt>
                  <dd>{item.endDate}</dd>
                </div>
                <div>
                  <dt>Reservation gốc</dt>
                  <dd>
                    <Link to={`/manager/reservations/${item.reservation?.reference || item.reservation?.id}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                      {item.reservation?.reference || item.reservation?.id}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Loại sản phẩm</dt>
                  <dd>{item.reservation?.storageType?.name || '—'}</dd>
                </div>
              </dl>
            </section>
          )}

          {/* ==================== 6. RENTALS (ACTIVE) ==================== */}
          {resource === 'rentals' && (
            <>
              <section className="manager-section">
                <h2>Chi tiết kho đang thuê</h2>
                <dl className="manager-facts">
                  <div>
                    <dt>Mã Reservation</dt>
                    <dd>{item.reservationReference}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái thuê</dt>
                    <dd>{item.rentalState}</dd>
                  </div>
                  <div>
                    <dt>Khách hàng</dt>
                    <dd>{item.customer?.fullName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Số điện thoại</dt>
                    <dd>{item.customer?.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt>Ngày kết thúc hiệu lực</dt>
                    <dd>{item.effectiveEndDate}</dd>
                  </div>
                  <div>
                    <dt>Tình trạng quá hạn</dt>
                    <dd style={{ color: item.isOverdue ? '#dc2626' : '#166534', fontWeight: 700 }}>
                      {item.isOverdue ? 'ĐANG QUÁ HẠN' : 'Bình thường'}
                    </dd>
                  </div>
                </dl>

                {item.futureAllocationRisk?.hasFutureAllocation && (
                  <div style={{ marginTop: '16px', background: '#fef3c7', padding: '12px', borderRadius: '6px', border: '1px solid #fde047' }}>
                    <p style={{ color: '#854d0e', fontWeight: 700 }}>Cảnh báo xung đột kho tương lai:</p>
                    <p style={{ color: '#854d0e', fontSize: '13px', marginTop: '4px' }}>
                      Kho này đã có lịch đặt trước cho khách tiếp theo. Cần hoàn tất trả kho đúng hạn hoặc điều chuyển kho.
                    </p>
                  </div>
                )}
              </section>

              {item.contracts && item.contracts.length > 0 && (
                <section className="manager-section">
                  <h2>Danh sách hợp đồng và unit ({item.contracts.length})</h2>
                  <div className="manager-table-wrap">
                    <table className="manager-table">
                      <thead>
                        <tr>
                          <th>Hợp đồng</th>
                          <th>Kho vật lý</th>
                          <th>Trạng thái kho</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.contracts.map((c: any) => (
                          <tr key={c.id}>
                            <td><strong>{c.contractCode}</strong></td>
                            <td>
                              {c.unit?.unitCode ? (
                                <Link to={`/manager/units/${c.unit.unitCode}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                                  {c.unit.unitCode}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td><span className="manager-status">{c.unit?.status || c.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ==================== 7. RETURNS ==================== */}
          {resource === 'returns' && (
            <>
              <section className="manager-section">
                <h2>Yêu cầu trả kho</h2>
                <dl className="manager-facts">
                  <div>
                    <dt>Mã trả kho</dt>
                    <dd>{item.returnCode}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>{item.status}</dd>
                  </div>
                  <div>
                    <dt>Khách hàng</dt>
                    <dd>{item.customer?.fullName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Reservation</dt>
                    <dd>
                      <Link to={`/manager/reservations/${item.reservation?.reference || item.reservation?.id}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                        {item.reservation?.reference || item.reservation?.id}
                      </Link>
                    </dd>
                  </div>
                </dl>
              </section>

              {item.inspections && item.inspections.length > 0 && (
                <section className="manager-section">
                  <h2>Biên bản kiểm tra kho thực tế do Staff ghi nhận</h2>
                  <div className="manager-table-wrap">
                    <table className="manager-table">
                      <thead>
                        <tr>
                          <th>Kho</th>
                          <th>Kết quả</th>
                          <th>Loại sự cố</th>
                          <th>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.inspections.map((ins: any) => (
                          <tr key={ins.id}>
                            <td><strong>{ins.storageUnit?.unitNumber || 'Kho'}</strong></td>
                            <td>
                              <span className={`manager-status is-${ins.damageObserved ? 'rejected' : 'confirmed'}`}>
                                {ins.damageObserved ? 'Có lỗi' : 'Đạt'}
                              </span>
                            </td>
                            <td>{ins.issueType || 'Bình thường'}</td>
                            <td>{ins.conditionNote || ins.issueNote || 'Không có ghi chú'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ==================== 8. DEPOSIT SETTLEMENTS ==================== */}
          {resource === 'deposit-settlements' && (
            <>
              <section className="manager-section">
                <h2>Chi tiết quyết toán tiền cọc</h2>
                <dl className="manager-facts">
                  <div>
                    <dt>Mã quyết toán</dt>
                    <dd>{item.settlementCode}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>{item.status}</dd>
                  </div>
                  <div>
                    <dt>Khách hàng</dt>
                    <dd>{item.customer?.fullName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Tiền cọc ban đầu</dt>
                    <dd style={{ fontWeight: 800 }}>{formatVnd(item.initialDepositAmount)}</dd>
                  </div>
                  <div>
                    <dt>Tổng tiền khấu trừ đã duyệt</dt>
                    <dd style={{ color: '#dc2626', fontWeight: 800 }}>{formatVnd(item.totalCharges)}</dd>
                  </div>
                  <div>
                    <dt>Tiền hoàn lại cho khách</dt>
                    <dd style={{ color: '#166534', fontWeight: 800 }}>{formatVnd(item.refundAmount)}</dd>
                  </div>
                  <div>
                    <dt>Tiền khách phải đóng thêm</dt>
                    <dd style={{ color: item.outstandingAmount > 0 ? '#dc2626' : '#64748b', fontWeight: 800 }}>
                      {formatVnd(item.outstandingAmount)}
                    </dd>
                  </div>
                </dl>
              </section>

              {item.issues && item.issues.length > 0 && (
                <section className="manager-section">
                  <h2>Các lỗi phát hiện khi kiểm tra kho</h2>
                  <div className="manager-table-wrap">
                    <table className="manager-table">
                      <thead>
                        <tr>
                          <th>Kho</th>
                          <th>Loại lỗi</th>
                          <th>Số tiền duyệt trừ</th>
                          <th>Lý do</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.issues.map((issue: any) => (
                          <tr key={issue.id}>
                            <td><strong>{issue.inspection?.storageUnit?.unitNumber || 'Kho'}</strong></td>
                            <td>{issue.issueType}</td>
                            <td style={{ color: '#dc2626', fontWeight: 700 }}>{formatVnd(issue.approvedChargeAmount)}</td>
                            <td>{issue.reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ==================== 9. MAINTENANCE ==================== */}
          {resource === 'maintenance' && (
            <section className="manager-section">
              <h2>Chi tiết case bảo trì</h2>
              <dl className="manager-facts">
                <div>
                  <dt>Mã bảo trì</dt>
                  <dd>{item.maintenanceCode}</dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{item.status}</dd>
                </div>
                <div>
                  <dt>Kho cần sửa</dt>
                  <dd>
                    {item.storageUnit?.unitNumber ? (
                      <Link to={`/manager/units/${item.storageUnit.unitNumber}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                        {item.storageUnit.unitNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Danh mục</dt>
                  <dd>{item.category}</dd>
                </div>
                <div>
                  <dt>Mức độ ưu tiên</dt>
                  <dd style={{ color: item.priority === 'HIGH' ? '#dc2626' : 'inherit', fontWeight: 700 }}>
                    {item.priority}
                  </dd>
                </div>
                <div>
                  <dt>Staff phụ trách</dt>
                  <dd>{item.assignedStaff?.fullName || 'Chưa phân công'}</dd>
                </div>
              </dl>
              <div style={{ marginTop: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--color-slate)' }}>Mô tả sự cố:</p>
                <p style={{ marginTop: '4px' }}>{item.description}</p>
              </div>
              {item.workNote && (
                <div style={{ marginTop: '16px', background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--color-slate)' }}>Ghi chú hoàn thành của Staff:</p>
                  <p style={{ marginTop: '4px' }}>{item.workNote}</p>
                </div>
              )}
            </section>
          )}

          {/* ==================== 10. TRANSFERS ==================== */}
          {resource === 'transfers' && (
            <section className="manager-section">
              <h2>Chi tiết chuyển kho</h2>
              <dl className="manager-facts">
                <div>
                  <dt>Mã chuyển kho</dt>
                  <dd>{item.transferCode}</dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{item.status}</dd>
                </div>
                <div>
                  <dt>Hợp đồng</dt>
                  <dd>{item.rentalContract?.contractCode || '—'}</dd>
                </div>
                <div>
                  <dt>Lý do chuyển</dt>
                  <dd>{item.reason}</dd>
                </div>
                <div>
                  <dt>Từ kho</dt>
                  <dd>
                    {item.fromStorageUnit?.unitNumber ? (
                      <Link to={`/manager/units/${item.fromStorageUnit.unitNumber}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                        {item.fromStorageUnit.unitNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Sang kho đích</dt>
                  <dd>
                    {item.toStorageUnit?.unitNumber ? (
                      <Link to={`/manager/units/${item.toStorageUnit.unitNumber}`} style={{ color: 'var(--color-navy)', fontWeight: 700 }}>
                        {item.toStorageUnit.unitNumber}
                      </Link>
                    ) : (
                      'Chưa gán kho đích'
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {/* ==================== 11. SUPPORT REQUESTS ==================== */}
          {resource === 'support-requests' && (
            <section className="manager-section">
              <h2>Chi tiết yêu cầu hỗ trợ</h2>
              <dl className="manager-facts">
                <div>
                  <dt>Mã hỗ trợ</dt>
                  <dd>{item.supportCode}</dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{item.status}</dd>
                </div>
                <div>
                  <dt>Khách hàng</dt>
                  <dd>{item.customer?.fullName || '—'}</dd>
                </div>
                <div>
                  <dt>Danh mục</dt>
                  <dd>{item.category}</dd>
                </div>
                <div>
                  <dt>Độ ưu tiên</dt>
                  <dd style={{ color: item.priority === 'HIGH' ? '#dc2626' : 'inherit', fontWeight: 700 }}>{item.priority}</dd>
                </div>
                <div>
                  <dt>Staff phụ trách</dt>
                  <dd>{item.assignedStaff?.fullName || 'Chưa gán'}</dd>
                </div>
              </dl>
              <div style={{ marginTop: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--color-slate)' }}>Tiêu đề:</p>
                <p style={{ marginTop: '4px', fontWeight: 700 }}>{item.subject}</p>
              </div>
              <div style={{ marginTop: '12px' }}>
                <p style={{ fontSize: '13px', color: 'var(--color-slate)' }}>Nội dung:</p>
                <p style={{ marginTop: '4px' }}>{item.description}</p>
              </div>
              {item.resolutionNote && (
                <div style={{ marginTop: '16px', background: '#dcfce7', padding: '12px', borderRadius: '6px' }}>
                  <p style={{ fontSize: '13px', color: '#166534', fontWeight: 700 }}>Kết quả xử lý ({item.resolutionType}):</p>
                  <p style={{ marginTop: '4px', color: '#166534' }}>{item.resolutionNote}</p>
                </div>
              )}
            </section>
          )}

        </div>

        {/* ==================== ASIDE ACTION PANEL ==================== */}
        <aside className="manager-processing">
          <h2>Xử lý nghiệp vụ</h2>

          {/* APPOINTMENTS ACTION */}
          {resource === 'appointments' && (
            item.status === 'REQUESTED' ? (
              <div>
                <p className="manager-action-copy">
                  Xác nhận lịch bàn giao sau khi khách đã hoàn tất thanh toán đợt đầu.
                </p>
                <button
                  className="button-primary w-full justify-center"
                  onClick={() => runAction(() => managerOpsApi.confirmAppointment(id), 'Đã xác nhận lịch bàn giao!')}
                  disabled={acting}
                >
                  <Check size={16} /> {acting ? 'Đang xác nhận…' : 'Xác nhận lịch hẹn'}
                </button>
              </div>
            ) : (
              <p className="manager-action-copy">Lịch bàn giao hiện ở trạng thái {item.status}.</p>
            )
          )}

          {/* RENEWALS ACTION */}
          {resource === 'renewals' && (
            item.status === 'PENDING' ? (
              <div style={{ display: 'grid', gap: '14px' }}>
                <p className="manager-action-copy">
                  Duyệt gia hạn sẽ kiểm tra không có xung đột tồn kho tương lai và tự động tạo hóa đơn gia hạn.
                </p>
                <button
                  className="button-primary w-full justify-center"
                  onClick={() => runAction(() => managerOpsApi.approveRenewal(id), 'Đã duyệt gia hạn thành công!')}
                  disabled={acting}
                >
                  <Check size={16} /> {acting ? 'Đang duyệt…' : 'Duyệt gia hạn'}
                </button>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                  <label className="field-label">
                    Lý do từ chối
                    <textarea
                      rows={2}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Nhập lý do không thể gia hạn…"
                    />
                  </label>
                  <button
                    className="button-secondary manager-action-secondary"
                    onClick={() => runAction(() => managerOpsApi.rejectRenewal(id, rejectReason), 'Đã từ chối gia hạn.')}
                    disabled={acting || !rejectReason.trim()}
                  >
                    <X size={16} /> Từ chối gia hạn
                  </button>
                </div>
              </div>
            ) : (
              <p className="manager-action-copy">Yêu cầu gia hạn ở trạng thái {item.status}.</p>
            )
          )}

          {/* INVOICES ACTION */}
          {resource === 'invoices' && (
            item.balanceDue > 0 ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const amt = Number(payAmount) || item.balanceDue
                  runAction(
                    () => managerOpsApi.recordPayment(id, { amount: amt, method: payMethod, reference: payRef || undefined, note: payNote || undefined }),
                    'Đã ghi nhận thanh toán thành công!'
                  )
                }}
              >
                <p className="manager-action-copy">
                  Ghi nhận khoản thanh toán từ khách (Chuyển khoản hoặc Tiền mặt).
                </p>
                <label className="field-label">
                  Số tiền thanh toán (VND)
                  <input
                    type="number"
                    max={item.balanceDue}
                    min={1}
                    value={payAmount === '' ? item.balanceDue : payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    required
                  />
                </label>
                <label className="field-label" style={{ marginTop: '10px' }}>
                  Phương thức
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as any)}>
                    <option value="BANK_TRANSFER">Chuyển khoản ngân hàng</option>
                    <option value="CASH">Tiền mặt</option>
                  </select>
                </label>
                <label className="field-label" style={{ marginTop: '10px' }}>
                  Mã giao dịch / Tham chiếu
                  <input
                    type="text"
                    placeholder="Mã chuyển khoản ngân hàng…"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                  />
                </label>
                <label className="field-label" style={{ marginTop: '10px' }}>
                  Ghi chú
                  <textarea
                    rows={2}
                    placeholder="Ghi chú đợt thanh toán…"
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                  />
                </label>
                <button className="button-primary w-full justify-center" style={{ marginTop: '14px' }} disabled={acting}>
                  <WalletCards size={16} /> {acting ? 'Đang ghi nhận…' : 'Ghi nhận thanh toán'}
                </button>
              </form>
            ) : (
              <p className="manager-action-copy" style={{ color: '#166534', fontWeight: 700 }}>
                ✓ Hóa đơn đã được thanh toán đầy đủ.
              </p>
            )
          )}

          {/* DEPOSIT SETTLEMENTS ACTION */}
          {resource === 'deposit-settlements' && (
            item.status === 'PENDING_REVIEW' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const issues = (item.issues || []).map((iss: any) => ({
                    inspectionId: iss.inspectionId || iss.id,
                    issueType: issueCharges[iss.id]?.type || iss.issueType || 'CUSTOMER_DAMAGE',
                    approvedChargeAmount: issueCharges[iss.id]?.amount ?? iss.approvedChargeAmount ?? 0,
                    reason: issueCharges[iss.id]?.reason || iss.reason || 'Duyệt chi phí sửa chữa',
                  }))
                  runAction(
                    () => managerOpsApi.reviewDepositSettlement(id, { issues, note: reviewNote || undefined }),
                    'Đã duyệt quyết toán cọc thành công!'
                  )
                }}
              >
                <p className="manager-action-copy">
                  Duyệt các khoản khấu trừ hư hỏng, mất chìa khóa trước khi hoàn cọc.
                </p>
                {item.issues?.map((iss: any) => (
                  <div key={iss.id} style={{ border: '1px solid var(--color-border)', padding: '10px', borderRadius: '6px', marginBottom: '10px' }}>
                    <small>Lỗi: <strong>{iss.issueType}</strong></small>
                    <label className="field-label" style={{ marginTop: '6px' }}>
                      Số tiền phạt (VND)
                      <input
                        type="number"
                        min={0}
                        defaultValue={iss.approvedChargeAmount || 0}
                        onChange={(e) => {
                          const val = Number(e.target.value)
                          setIssueCharges((prev) => ({
                            ...prev,
                            [iss.id]: { ...(prev[iss.id] || {}), amount: val, type: iss.issueType, reason: iss.reason || '' },
                          }))
                        }}
                      />
                    </label>
                  </div>
                ))}
                <label className="field-label">
                  Ghi chú duyệt
                  <textarea rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Ghi chú thẩm định…" />
                </label>
                <button className="button-primary w-full justify-center" style={{ marginTop: '12px' }} disabled={acting}>
                  <Check size={16} /> {acting ? 'Đang duyệt…' : 'Duyệt quyết toán'}
                </button>
              </form>
            ) : item.status === 'APPROVED' && item.refundAmount > 0 && item.outstandingAmount === 0 ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  runAction(
                    () => managerOpsApi.refundDeposit(id, { method: refundMethod, reference: refundRef, note: refundNote || undefined }),
                    'Đã ghi nhận hoàn cọc thành công!'
                  )
                }}
              >
                <p className="manager-action-copy">
                  Xác nhận đã chuyển hoàn {formatVnd(item.refundAmount)} cho khách hàng.
                </p>
                <label className="field-label">
                  Phương thức hoàn
                  <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as any)}>
                    <option value="BANK_TRANSFER">Chuyển khoản ngân hàng</option>
                    <option value="CASH">Tiền mặt</option>
                  </select>
                </label>
                <label className="field-label" style={{ marginTop: '10px' }}>
                  Mã tham chiếu ngân hàng
                  <input
                    type="text"
                    required
                    placeholder="Mã giao dịch hoàn tiền…"
                    value={refundRef}
                    onChange={(e) => setRefundRef(e.target.value)}
                  />
                </label>
                <label className="field-label" style={{ marginTop: '10px' }}>
                  Ghi chú
                  <textarea rows={2} value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
                </label>
                <button className="button-primary w-full justify-center" style={{ marginTop: '12px' }} disabled={acting || !refundRef.trim()}>
                  <Check size={16} /> {acting ? 'Đang xác nhận…' : 'Ghi nhận hoàn cọc'}
                </button>
              </form>
            ) : (
              <p className="manager-action-copy">Quyết toán cọc ở trạng thái {item.status}.</p>
            )
          )}

          {/* MAINTENANCE ACTION */}
          {resource === 'maintenance' && (
            <div style={{ display: 'grid', gap: '16px' }}>
              {item.status === 'AWAITING_VERIFICATION' && (
                <div style={{ background: '#fef3c7', padding: '14px', borderRadius: '6px' }}>
                  <p style={{ fontWeight: 700, color: '#854d0e', marginBottom: '8px' }}>
                    Staff đã báo hoàn tất sửa chữa. Vui lòng nghiệm thu:
                  </p>
                  <label className="field-label">
                    Ghi chú nghiệm thu
                    <input
                      type="text"
                      placeholder="Ghi chú xác minh kho sẵn sàng…"
                      value={mVerifyNote}
                      onChange={(e) => setMVerifyNote(e.target.value)}
                    />
                  </label>
                  <button
                    className="button-primary w-full justify-center"
                    style={{ marginTop: '8px' }}
                    onClick={() => runAction(() => managerOpsApi.verifyMaintenance(id, mVerifyNote), 'Đã nghiệm thu! Kho đã mở lại AVAILABLE.')}
                    disabled={acting}
                  >
                    <Check size={16} /> Nghiệm thu & Mở kho AVAILABLE
                  </button>

                  <div style={{ marginTop: '12px', borderTop: '1px solid #fde047', paddingTop: '10px' }}>
                    <label className="field-label">
                      Lý do chưa đạt
                      <input
                        type="text"
                        placeholder="Nội dung cần làm lại…"
                        value={mRejectNote}
                        onChange={(e) => setMRejectNote(e.target.value)}
                      />
                    </label>
                    <button
                      className="button-secondary manager-action-secondary"
                      onClick={() => runAction(() => managerOpsApi.rejectMaintenanceVerification(id, mRejectNote), 'Đã trả về cho staff làm tiếp.')}
                      disabled={acting || !mRejectNote.trim()}
                    >
                      <X size={16} /> Từ chối nghiệm thu
                    </button>
                  </div>
                </div>
              )}

              {item.status !== 'COMPLETED' && (
                <>
                  <div>
                    <label className="field-label">
                      Giao việc cho Staff (User ID)
                      <input
                        type="text"
                        placeholder="Nhập ID tài khoản Staff…"
                        value={mStaffId}
                        onChange={(e) => setMStaffId(e.target.value)}
                      />
                    </label>
                    <button
                      className="button-secondary"
                      style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
                      onClick={() => runAction(() => managerOpsApi.assignMaintenance(id, mStaffId), 'Đã giao việc cho Staff!')}
                      disabled={acting || !mStaffId.trim()}
                    >
                      <Wrench size={16} /> Phân công nhân viên
                    </button>
                  </div>

                  <div>
                    <label className="field-label">
                      Đổi độ ưu tiên
                      <select value={mPriority} onChange={(e) => setMPriority(e.target.value)}>
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    </label>
                    <button
                      className="button-secondary"
                      style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
                      onClick={() => runAction(() => managerOpsApi.updateMaintenancePriority(id, mPriority), 'Đã cập nhật độ ưu tiên!')}
                      disabled={acting}
                    >
                      Cập nhật ưu tiên
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TRANSFERS ACTION */}
          {resource === 'transfers' && (
            item.status === 'REQUESTED' ? (
              <div style={{ display: 'grid', gap: '14px' }}>
                <p className="manager-action-copy">
                  Duyệt chuyển kho sang một unit còn trống cùng loại.
                </p>
                <label className="field-label">
                  Mã hoặc ID kho đích (AVAILABLE)
                  <input
                    type="text"
                    required
                    placeholder="Nhập ID hoặc mã kho đích…"
                    value={destUnitId}
                    onChange={(e) => setDestUnitId(e.target.value)}
                  />
                </label>
                <button
                  className="button-primary w-full justify-center"
                  onClick={() => runAction(() => managerOpsApi.approveTransfer(id, destUnitId), 'Đã duyệt chuyển kho!')}
                  disabled={acting || !destUnitId.trim()}
                >
                  <Check size={16} /> Duyệt chuyển kho
                </button>
                <button
                  className="button-secondary manager-action-secondary"
                  onClick={() => runAction(() => managerOpsApi.rejectTransfer(id), 'Đã từ chối chuyển kho.')}
                  disabled={acting}
                >
                  <X size={16} /> Từ chối yêu cầu
                </button>
              </div>
            ) : (
              <p className="manager-action-copy">Yêu cầu chuyển kho ở trạng thái {item.status}.</p>
            )
          )}

          {/* SUPPORT REQUESTS ACTION */}
          {resource === 'support-requests' && (
            item.status !== 'RESOLVED' ? (
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label className="field-label">
                    Giao cho Staff xử lý (User ID)
                    <input
                      type="text"
                      placeholder="Nhập User ID của Staff…"
                      value={sStaffId}
                      onChange={(e) => setSStaffId(e.target.value)}
                    />
                  </label>
                  <button
                    className="button-secondary"
                    style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
                    onClick={() => runAction(() => managerOpsApi.assignSupport(id, sStaffId), 'Đã giao cho Staff!')}
                    disabled={acting || !sStaffId.trim()}
                  >
                    Gán Staff phụ trách
                  </button>
                </div>

                <div>
                  <label className="field-label">
                    Đổi độ ưu tiên
                    <select value={sPriority} onChange={(e) => setSPriority(e.target.value)}>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                    </select>
                  </label>
                  <button
                    className="button-secondary"
                    style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
                    onClick={() => runAction(() => managerOpsApi.updateSupportPriority(id, sPriority), 'Đã đổi độ ưu tiên!')}
                    disabled={acting}
                  >
                    Cập nhật ưu tiên
                  </button>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                  <label className="field-label">
                    Kết quả xử lý
                    <select value={sResType} onChange={(e) => setSResType(e.target.value)}>
                      <option value="MANAGER_RESOLVED">Manager giải quyết trực tiếp</option>
                      <option value="TRANSFER_RECOMMENDED">Đề xuất chuyển kho</option>
                      <option value="ACCESS_RESTORED">Khôi phục quyền truy cập</option>
                      <option value="PAYMENT_GUIDANCE">Hướng dẫn thanh toán</option>
                      <option value="NO_ACTION_REQUIRED">Không cần xử lý thêm</option>
                    </select>
                  </label>
                  <label className="field-label" style={{ marginTop: '8px' }}>
                    Ghi chú giải quyết
                    <textarea
                      rows={3}
                      required
                      placeholder="Chi tiết cách giải quyết cho khách…"
                      value={sResNote}
                      onChange={(e) => setSResNote(e.target.value)}
                    />
                  </label>
                  <button
                    className="button-primary w-full justify-center"
                    style={{ marginTop: '10px' }}
                    onClick={() => runAction(() => managerOpsApi.resolveSupport(id, { resolutionType: sResType, resolutionNote: sResNote }), 'Đã đóng ticket hỗ trợ thành công!')}
                    disabled={acting || !sResNote.trim()}
                  >
                    <Check size={16} /> Đóng yêu cầu hỗ trợ (Resolve)
                  </button>
                </div>
              </div>
            ) : (
              <p className="manager-action-copy" style={{ color: '#166534', fontWeight: 700 }}>
                ✓ Ticket hỗ trợ đã hoàn tất.
              </p>
            )
          )}

          {/* DEFAULT / OTHER */}
          {!['appointments', 'renewals', 'invoices', 'deposit-settlements', 'maintenance', 'transfers', 'support-requests'].includes(resource) && (
            <p className="manager-action-copy">Phân hệ {resource} là phân hệ chỉ đọc trong phiên bản hiện tại.</p>
          )}

        </aside>
      </div>
    </section>
  )
}

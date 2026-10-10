import { BarChart3, CheckCircle2, Clock, DollarSign, RefreshCw, Warehouse, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useApiResource } from '../../services/useApiResource'
import type { Paginated } from '../../types/internal'

export function ManagerReportsPage() {
  const { user } = useAuth()

  const summary = useApiResource<any>('/manager/dashboard/summary', user?.id ?? '')
  const units = useApiResource<Paginated<any>>('/manager/units?limit=100', user?.id ?? '')
  const invoices = useApiResource<Paginated<any>>('/manager/invoices?limit=100', user?.id ?? '')
  const reservations = useApiResource<Paginated<any>>('/manager/reservations?limit=100', user?.id ?? '')

  const loading = summary.loading || units.loading || invoices.loading || reservations.loading

  const refreshAll = () => {
    summary.refresh()
    units.refresh()
    invoices.refresh()
    reservations.refresh()
  }

  // Financial calculations
  const invoiceItems = invoices.data?.items ?? []
  const totalBilled = invoiceItems.reduce((acc: number, item: any) => acc + (Number(item.totalAmount) || 0), 0)
  const totalCollected = invoiceItems.reduce((acc: number, item: any) => acc + (Number(item.amountPaid) || 0), 0)
  const totalOutstanding = invoiceItems.reduce((acc: number, item: any) => acc + (Number(item.balanceDue) || 0), 0)
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0

  // Unit occupancy calculation
  const unitItems = units.data?.items ?? []
  const unitsTotal = unitItems.length
  const unitsOccupied = unitItems.filter((u: any) => u.status === 'OCCUPIED').length
  const unitsAvailable = unitItems.filter((u: any) => u.status === 'AVAILABLE').length
  const unitsMaintenance = unitItems.filter((u: any) => u.status === 'MAINTENANCE').length
  const occupancyPercent = unitsTotal > 0 ? Math.round((unitsOccupied / unitsTotal) * 100) : 0

  // Units grouped by storage type
  const typeMap = new Map<string, { name: string; total: number; occupied: number; available: number }>()
  for (const u of unitItems) {
    const typeName = u.storageType?.name || 'Khác'
    const cur = typeMap.get(typeName) || { name: typeName, total: 0, occupied: 0, available: 0 }
    cur.total += 1
    if (u.status === 'OCCUPIED') cur.occupied += 1
    if (u.status === 'AVAILABLE') cur.available += 1
    typeMap.set(typeName, cur)
  }
  const typeStats = [...typeMap.values()]

  // Reservation stats
  const resItems = reservations.data?.items ?? []
  const resConfirmed = resItems.filter((r: any) => r.status === 'CONFIRMED').length
  const resPending = resItems.filter((r: any) => r.status === 'PENDING').length
  const resRejected = resItems.filter((r: any) => ['REJECTED', 'CANCELLED'].includes(r.status)).length

  const formatVnd = (val: number) => new Intl.NumberFormat('vi-VN').format(val) + ' đ'

  return (
    <section>
      <header className="manager-page-header">
        <div>
          <p className="eyebrow">Báo cáo & Phân tích · Giám sát hiệu quả</p>
          <h1>Báo cáo vận hành</h1>
          <p>Số liệu tổng hợp được trích xuất từ toàn bộ dữ liệu giao dịch và kho thực tế.</p>
        </div>
        <button className="button-secondary" onClick={refreshAll} disabled={loading}>
          <RefreshCw size={16} /> Làm mới báo cáo
        </button>
      </header>

      {loading ? (
        <p role="status">Đang tổng hợp dữ liệu báo cáo…</p>
      ) : (
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* FINANCIAL SECTION */}
          <section className="manager-section">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={20} style={{ color: '#166534' }} />
              Chỉ số tài chính & Thu hồi công nợ
            </h2>
            <div className="manager-kpi-banner" style={{ marginBottom: '16px' }}>
              <div className="manager-banner-card" style={{ borderLeft: '4px solid #2563eb' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-slate)', textTransform: 'uppercase' }}>
                  Tổng doanh số phát sinh
                </span>
                <div style={{ fontSize: '26px', fontWeight: 850, color: 'var(--color-navy)', marginTop: '6px' }}>
                  {formatVnd(totalBilled)}
                </div>
                <small style={{ color: 'var(--color-slate)' }}>Từ {invoiceItems.length} hóa đơn trong hệ thống</small>
              </div>

              <div className="manager-banner-card" style={{ borderLeft: '4px solid #10b981' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-slate)', textTransform: 'uppercase' }}>
                  Thực thu (Đã nhận tiền)
                </span>
                <div style={{ fontSize: '26px', fontWeight: 850, color: '#166534', marginTop: '6px' }}>
                  {formatVnd(totalCollected)}
                </div>
                <small style={{ color: '#166534', fontWeight: 700 }}>Tỷ lệ thu hồi: {collectionRate}%</small>
              </div>

              <div className="manager-banner-card" style={{ borderLeft: '4px solid #ef4444' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-slate)', textTransform: 'uppercase' }}>
                  Công nợ còn tồn đọng
                </span>
                <div style={{ fontSize: '26px', fontWeight: 850, color: '#dc2626', marginTop: '6px' }}>
                  {formatVnd(totalOutstanding)}
                </div>
                <small style={{ color: '#dc2626' }}>Cần theo dõi đôn đốc thanh toán</small>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Link to="/manager/operations/invoices" className="button-secondary" style={{ fontSize: '13px' }}>
                Xem chi tiết danh sách hóa đơn →
              </Link>
            </div>
          </section>

          {/* UNIT OCCUPANCY BREAKDOWN */}
          <section className="manager-section">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Warehouse size={20} style={{ color: '#2563eb' }} />
              Năng lực & Tỷ lệ lấp đầy kho vật lý
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-slate)', fontWeight: 700 }}>TỔNG KHO VẬT LÝ</span>
                <div style={{ fontSize: '28px', fontWeight: 850, color: 'var(--color-navy)', marginTop: '4px' }}>
                  {unitsTotal} kho
                </div>
              </div>
              <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <span style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: 700 }}>ĐANG CHO THUÊ</span>
                <div style={{ fontSize: '28px', fontWeight: 850, color: '#1e40af', marginTop: '4px' }}>
                  {unitsOccupied} kho ({occupancyPercent}%)
                </div>
              </div>
              <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '12px', color: '#15803d', fontWeight: 700 }}>SẴN SÀNG CHO THUÊ</span>
                <div style={{ fontSize: '28px', fontWeight: 850, color: '#166534', marginTop: '4px' }}>
                  {unitsAvailable} kho
                </div>
              </div>
              <div style={{ padding: '16px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
                <span style={{ fontSize: '12px', color: '#b45309', fontWeight: 700 }}>ĐANG BẢO TRÌ</span>
                <div style={{ fontSize: '28px', fontWeight: 850, color: '#92400e', marginTop: '4px' }}>
                  {unitsMaintenance} kho
                </div>
              </div>
            </div>

            {/* Type breakdown table */}
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-navy)', marginBottom: '10px' }}>
              Hiệu suất theo từng loại kho
            </h3>
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Loại kho</th>
                    <th>Tổng số kho</th>
                    <th>Đang thuê</th>
                    <th>Còn trống</th>
                    <th>Tỷ lệ lấp đầy</th>
                  </tr>
                </thead>
                <tbody>
                  {typeStats.map((stat) => {
                    const rate = stat.total > 0 ? Math.round((stat.occupied / stat.total) * 100) : 0
                    return (
                      <tr key={stat.name}>
                        <td><strong>{stat.name}</strong></td>
                        <td>{stat.total} kho</td>
                        <td style={{ color: '#1d4ed8', fontWeight: 700 }}>{stat.occupied} kho</td>
                        <td style={{ color: '#15803d' }}>{stat.available} kho</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="manager-progress-track" style={{ width: '100px', height: '8px' }}>
                              <div className="manager-progress-segment" style={{ width: `${rate}%`, background: '#2563eb' }} />
                            </div>
                            <span style={{ fontWeight: 800, fontSize: '13px' }}>{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* RESERVATION PIPELINE */}
          <section className="manager-section">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={20} style={{ color: '#7c3aed' }} />
              Phễu tiếp nhận & Tỷ lệ phê duyệt Reservation
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <Clock size={28} style={{ color: '#f59e0b' }} />
                <div>
                  <small style={{ color: 'var(--color-slate)', fontWeight: 700 }}>ĐANG CHỜ DUYỆT</small>
                  <div style={{ fontSize: '24px', fontWeight: 850, color: 'var(--color-navy)' }}>{resPending}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <CheckCircle2 size={28} style={{ color: '#16a34a' }} />
                <div>
                  <small style={{ color: '#15803d', fontWeight: 700 }}>ĐÃ XÁC NHẬN</small>
                  <div style={{ fontSize: '24px', fontWeight: 850, color: '#166534' }}>{resConfirmed}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <XCircle size={28} style={{ color: '#dc2626' }} />
                <div>
                  <small style={{ color: '#b91c1c', fontWeight: 700 }}>TỪ CHỐI / ĐÃ HỦY</small>
                  <div style={{ fontSize: '24px', fontWeight: 850, color: '#991b1b' }}>{resRejected}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Link to="/manager/reservations" className="button-secondary" style={{ fontSize: '13px' }}>
                Mở danh sách Reservation →
              </Link>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

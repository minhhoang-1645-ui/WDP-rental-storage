import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  HardHat,
  Headphones,
  PackageCheck,
  Plus,
  RefreshCw,
  Undo2,
  WalletCards,
  Warehouse,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useApiResource } from '../../services/useApiResource'

type DashboardSummary = Record<
  | 'pendingReservations'
  | 'activeRentals'
  | 'overdueRentals'
  | 'upcomingAppointments'
  | 'pendingRenewals'
  | 'openSupportRequests'
  | 'maintenanceUnits'
  | 'pendingDepositSettlements'
  | 'availableUnits'
  | 'occupiedUnits',
  number
>

interface MetricCardDef {
  key: keyof DashboardSummary
  label: string
  to: string
  icon: any
  type: 'danger' | 'alert' | 'success' | 'primary'
  desc: string
}

const metricCards: MetricCardDef[] = [
  {
    key: 'pendingReservations',
    label: 'Yêu cầu đặt kho chờ xử lý',
    to: '/manager/reservations',
    icon: ClipboardCheck,
    type: 'alert',
    desc: 'Đang đợi phê duyệt và phân bổ kho',
  },
  {
    key: 'activeRentals',
    label: 'Hợp đồng đang thuê',
    to: '/manager/operations/rentals',
    icon: PackageCheck,
    type: 'primary',
    desc: 'Khách hàng đang lưu trữ đồ thực tế',
  },
  {
    key: 'overdueRentals',
    label: 'Hợp đồng quá hạn',
    to: '/manager/operations/rentals',
    icon: AlertTriangle,
    type: 'danger',
    desc: 'Cần đôn đốc trả kho hoặc gia hạn',
  },
  {
    key: 'upcomingAppointments',
    label: 'Lịch bàn giao sắp tới',
    to: '/manager/operations/appointments',
    icon: CalendarClock,
    type: 'primary',
    desc: 'Khách hẹn đến nhận bàn giao kho',
  },
  {
    key: 'pendingRenewals',
    label: 'Gia hạn chờ duyệt',
    to: '/manager/operations/renewals',
    icon: Undo2,
    type: 'alert',
    desc: 'Khách đăng ký gia hạn thêm kỳ',
  },
  {
    key: 'openSupportRequests',
    label: 'Yêu cầu hỗ trợ mở',
    to: '/manager/operations/support-requests',
    icon: Headphones,
    type: 'alert',
    desc: 'Vấn đề kho, khóa, thẻ hoặc thanh toán',
  },
  {
    key: 'maintenanceUnits',
    label: 'Kho đang bảo trì',
    to: '/manager/operations/maintenance',
    icon: HardHat,
    type: 'danger',
    desc: 'Đang khóa tạm để sửa chữa hoặc vệ sinh',
  },
  {
    key: 'pendingDepositSettlements',
    label: 'Quyết toán cọc chờ duyệt',
    to: '/manager/operations/deposit-settlements',
    icon: WalletCards,
    type: 'alert',
    desc: 'Khấu trừ hư hại và hoàn tiền cọc',
  },
  {
    key: 'availableUnits',
    label: 'Kho sẵn sàng cho thuê',
    to: '/manager/units',
    icon: Warehouse,
    type: 'success',
    desc: 'Kho sạch trống sẵn sàng nhận khách mới',
  },
  {
    key: 'occupiedUnits',
    label: 'Kho vật lý có người dùng',
    to: '/manager/units',
    icon: PackageCheck,
    type: 'primary',
    desc: 'Tổng số unit vật lý đang occupied',
  },
]

export function ManagerDashboardPage() {
  const { user } = useAuth()
  const { data, error, loading, refresh } = useApiResource<DashboardSummary>(
    '/manager/dashboard/summary',
    user?.id ?? ''
  )

  const totalUnits = data ? (data.availableUnits + data.occupiedUnits + data.maintenanceUnits) : 0
  const occupancyRate = totalUnits > 0 && data ? Math.round((data.occupiedUnits / totalUnits) * 100) : 0
  const urgentCount = data
    ? data.pendingReservations +
      data.overdueRentals +
      data.pendingRenewals +
      data.openSupportRequests +
      data.maintenanceUnits +
      data.pendingDepositSettlements
    : 0

  return (
    <section>
      <header className="manager-page-header">
        <div>
          <p className="eyebrow">Trung tâm điều hành · Giám sát vận hành</p>
          <h1>Manager Dashboard</h1>
          <p>Dữ liệu hệ thống và cảnh báo vận hành được cập nhật trực tiếp theo thời gian thực.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/manager/reports" className="button-secondary">
            <BarChart3 size={16} /> Báo cáo chi tiết
          </Link>
          <button className="button-secondary" onClick={refresh} disabled={loading}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
      </header>

      {loading ? (
        <p role="status">Đang tải số liệu tổng quan…</p>
      ) : error ? (
        <div className="booking-alert is-error" role="alert">
          {error}
          <button onClick={refresh}>Thử lại</button>
        </div>
      ) : data ? (
        <>
          {/* URGENT ACTION BANNER */}
          {urgentCount > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                marginBottom: '24px',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '999px',
                    background: '#fef3c7',
                    color: '#b45309',
                  }}
                >
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <strong style={{ color: '#92400e', fontSize: '15px' }}>
                    Có {urgentCount} nghiệp vụ đang cần Manager xử lý
                  </strong>
                  <p style={{ color: '#b45309', fontSize: '13px', marginTop: '2px' }}>
                    Gồm {data.pendingReservations} đặt kho chờ duyệt, {data.overdueRentals} hợp đồng quá hạn,{' '}
                    {data.pendingRenewals} gia hạn và {data.openSupportRequests} yêu cầu hỗ trợ.
                  </p>
                </div>
              </div>
              <Link to="/manager/reservations" className="button-primary" style={{ textDecoration: 'none' }}>
                Xử lý ngay <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 20px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                marginBottom: '24px',
                color: '#166534',
              }}
            >
              <PackageCheck size={20} />
              <strong style={{ fontSize: '14px' }}>
                Tất cả quy trình vận hành đang trong trạng thái ổn định, không có hồ sơ tồn đọng.
              </strong>
            </div>
          )}

          {/* CAPACITY & OCCUPANCY OVERVIEW */}
          <div className="manager-kpi-banner">
            <article className="manager-banner-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-slate)', textTransform: 'uppercase' }}>
                    Tỷ lệ lấp đầy kho vật lý
                  </span>
                  <div style={{ fontSize: '36px', fontWeight: 850, color: 'var(--color-navy)', marginTop: '4px' }}>
                    {occupancyRate}%
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-slate)' }}>Tổng năng lực:</span>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-navy)' }}>
                    {totalUnits} kho
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="manager-progress-track" style={{ height: '12px' }}>
                <div
                  className="manager-progress-segment"
                  style={{ width: `${occupancyRate}%`, background: '#2563eb' }}
                  title={`Đang dùng: ${data.occupiedUnits} kho`}
                />
                <div
                  className="manager-progress-segment"
                  style={{
                    width: `${totalUnits > 0 ? (data.availableUnits / totalUnits) * 100 : 0}%`,
                    background: '#10b981',
                  }}
                  title={`Sẵn sàng: ${data.availableUnits} kho`}
                />
                <div
                  className="manager-progress-segment"
                  style={{
                    width: `${totalUnits > 0 ? (data.maintenanceUnits / totalUnits) * 100 : 0}%`,
                    background: '#f59e0b',
                  }}
                  title={`Bảo trì: ${data.maintenanceUnits} kho`}
                />
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '12px', color: 'var(--color-slate)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#2563eb' }} />
                  Đang dùng: <strong>{data.occupiedUnits}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#10b981' }} />
                  Sẵn sàng: <strong>{data.availableUnits}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#f59e0b' }} />
                  Bảo trì: <strong>{data.maintenanceUnits}</strong>
                </span>
              </div>
            </article>

            {/* QUICK ACTIONS SHORTCUTS */}
            <article className="manager-banner-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-slate)', textTransform: 'uppercase' }}>
                  Lối tắt tác vụ nhanh
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-navy)', marginTop: '4px' }}>
                  Quản trị viên thao tác trực tiếp
                </h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '16px' }}>
                <Link
                  to="/manager/reservations"
                  className="button-secondary"
                  style={{ textDecoration: 'none', fontSize: '13px', justifyContent: 'center' }}
                >
                  Duyệt Reservation
                </Link>
                <Link
                  to="/manager/operations/invoices"
                  className="button-secondary"
                  style={{ textDecoration: 'none', fontSize: '13px', justifyContent: 'center' }}
                >
                  Thu tiền hóa đơn
                </Link>
                <Link
                  to="/manager/operations/maintenance"
                  className="button-secondary"
                  style={{ textDecoration: 'none', fontSize: '13px', justifyContent: 'center' }}
                >
                  <Plus size={14} /> Case bảo trì
                </Link>
                <Link
                  to="/manager/units"
                  className="button-secondary"
                  style={{ textDecoration: 'none', fontSize: '13px', justifyContent: 'center' }}
                >
                  Tra cứu kho vật lý
                </Link>
              </div>
            </article>
          </div>

          {/* 10 INTERACTIVE METRICS CARDS */}
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-navy)', marginBottom: '16px' }}>
            Chỉ số vận hành chi tiết
          </h2>
          <div className="manager-dashboard-grid">
            {metricCards.map(({ key, label, to, icon: Icon, type, desc }) => {
              const val = data[key]
              const hasAlert = (type === 'danger' || type === 'alert') && val > 0
              return (
                <Link
                  key={key}
                  to={to}
                  className={`manager-dashboard-card ${
                    hasAlert
                      ? type === 'danger'
                        ? 'manager-dashboard-card--danger'
                        : 'manager-dashboard-card--alert'
                      : type === 'success'
                      ? 'manager-dashboard-card--success'
                      : 'manager-dashboard-card--primary'
                  }`}
                  style={{ padding: '16px', borderRadius: '8px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-slate)' }}>{label}</span>
                    <Icon size={20} style={{ color: hasAlert ? (type === 'danger' ? '#ef4444' : '#f59e0b') : 'var(--color-navy)' }} />
                  </div>
                  <strong style={{ fontSize: '32px', fontWeight: 850, color: 'var(--color-navy)', margin: '10px 0 4px 0' }}>
                    {val}
                  </strong>
                  <small style={{ color: 'var(--color-slate)', fontSize: '12px' }}>{desc}</small>
                </Link>
              )
            })}
          </div>
        </>
      ) : null}
    </section>
  )
}

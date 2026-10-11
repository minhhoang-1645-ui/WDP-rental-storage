import type { ReactNode } from 'react'
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react'
import { customerStatusLabel } from './CustomerPortalHelpers'

export function ReservationStatus({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PENDING: 'Chờ xử lý',
    CONFIRMED: 'Đã xác nhận',
    CANCELLED: 'Đã hủy',
    EXPIRED: 'Đã hết hạn',
  }
  return <span className={'customer-status customer-status--' + status.toLowerCase()}>{labels[status] ?? status}</span>
}

export function CustomerStatus({ status, label }: { status: string; label?: string }) {
  return <span className={'customer-status customer-status--' + status.toLowerCase()}>{label ?? customerStatusLabel(status)}</span>
}

export function PortalLoading({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return <div className="customer-state customer-state--loading" role="status">
    <span className="customer-spinner" aria-hidden="true" />
    <p>{label}</p>
  </div>
}

export function PortalError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="customer-state customer-state--error" role="alert">
    <AlertCircle size={28} />
    <div><h2>Chưa thể tải dữ liệu</h2><p>{message}</p></div>
    <button className="button-secondary" type="button" onClick={onRetry}><RefreshCw size={16} /> Thử lại</button>
  </div>
}

export function PortalEmpty({ icon, title, children, action }: { icon?: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="customer-state customer-state--empty">
    <span className="customer-state-icon">{icon ?? <Inbox size={30} />}</span>
    <h2>{title}</h2>
    <p>{children}</p>
    {action && <div className="customer-state-action">{action}</div>}
  </div>
}

export function PortalPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="customer-page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
    {action && <div className="customer-page-header-action">{action}</div>}
  </header>
}

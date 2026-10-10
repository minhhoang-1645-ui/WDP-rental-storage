import { CalendarClock, ClipboardCheck, RotateCcw, Warehouse } from 'lucide-react'
import { InternalPortalLayout } from '../../components/layout/InternalPortalLayout'

export function StaffLayout() { return <InternalPortalLayout label="Staff Portal" navigation={[
  { to: '/staff/appointments', label: 'Bàn giao', icon: CalendarClock },
  { to: '/staff/rentals', label: 'Kho đang thuê', icon: Warehouse },
  { to: '/staff/returns', label: 'Trả kho', icon: RotateCcw },
  { to: '/staff', label: 'Tác nghiệp', icon: ClipboardCheck, end: true },
]} /> }

import { Settings, Users } from 'lucide-react'
import { InternalPortalLayout } from '../../components/layout/InternalPortalLayout'
export function AdminLayout() { return <InternalPortalLayout label="Admin Portal" navigation={[{ to: '/admin/users', label: 'Người dùng', icon: Users }, { to: '/admin/settings', label: 'Cấu hình', icon: Settings }]} /> }

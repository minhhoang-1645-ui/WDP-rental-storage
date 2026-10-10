import { ClipboardCheck } from 'lucide-react'
import { InternalModuleShell } from '../../components/layout/InternalModuleShell'

export function StaffOperationsPage() { return <InternalModuleShell eyebrow="Nhân viên" title="Tác nghiệp tại cơ sở" description="Dùng điều hướng bên trái để xem lịch bàn giao, kho đang thuê và yêu cầu trả kho được backend cấp quyền." icon={<ClipboardCheck size={26} />} /> }

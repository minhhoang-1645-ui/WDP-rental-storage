import { Link } from 'react-router-dom'
import { Container } from '../ui/Container'

export function PortalPlaceholder({ role }: { role: string }) {
  return <main className="grid min-h-screen place-items-center bg-canvas px-6"><Container className="max-w-xl border border-border bg-white p-10 text-center"><p className="eyebrow">Khu vực {role}</p><h1 className="mt-3 text-3xl font-bold">Nền tảng đã sẵn sàng</h1><p className="mt-4 text-slate">Route và layout đã được chuẩn bị. Chức năng nghiệp vụ sẽ được phát triển ở milestone sau.</p><Link className="button-primary mt-7 inline-flex" to="/">Về trang chủ</Link></Container></main>
}

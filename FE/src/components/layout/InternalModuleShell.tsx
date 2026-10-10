import type { ReactNode } from 'react'

export function InternalModuleShell({ eyebrow, title, description, icon }: { eyebrow: string; title: string; description: string; icon?: ReactNode }) {
  return <section className="internal-module-shell"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="internal-module-intro">{description}</p><div className="internal-module-empty" role="status">{icon}<div><h2>Chọn một module vận hành</h2><p>Không hiển thị dữ liệu hoặc kết quả giả. Các module có dữ liệu sẽ tải trực tiếp từ API.</p></div></div></section>
}

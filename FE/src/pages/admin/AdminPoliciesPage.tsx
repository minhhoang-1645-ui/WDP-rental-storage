import { useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import { LoadState, PageHeader } from '../../components/manager/PortalUi';

type Policy = { key: string; title: string; description: string; unit: string; value: number; min: number; max: number; updatedAt: string | null; updatedById: string | null };
export function AdminPoliciesPage() {
  const { user } = useAuth();
  const result = useApiResource<{ items: Policy[] }>('/admin/business-policies', user?.id, true);
  return <section><PageHeader title="Chính sách hệ thống" description="Chỉ các thông số nghiệp vụ được cho phép. Thông tin ngân hàng, mật khẩu email và khóa bí mật được cấu hình riêng trên máy chủ." /><LoadState loading={result.loading} error={result.error} retry={result.refresh} />{result.data?.items.map(policy => <PolicyEditor key={`${policy.key}:${policy.updatedAt}`} policy={policy} saved={result.refresh} />)}</section>;
}
function PolicyEditor({ policy, saved }: { policy: Policy; saved: () => void }) {
  const [value, setValue] = useState(String(policy.value)), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  return <form className="manager-section policy-editor" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    try { await mutate(`/admin/business-policies/${policy.key}`, 'PATCH', { value: Number(value), expectedUpdatedAt: policy.updatedAt }); saved(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Chưa lưu được.'); }
    finally { setBusy(false); }
  }}><h2>{policy.title}</h2><p>{policy.description}</p><label className="field-label">Giá trị ({policy.unit})<input type="number" required min={policy.min} max={policy.max} step="1" value={value} onChange={event => setValue(event.target.value)} /></label><p className="portal-report-note">Cho phép {policy.min}–{policy.max} {policy.unit}. {policy.updatedAt ? `Cập nhật: ${new Date(policy.updatedAt).toLocaleString('vi-VN')}` : 'Đang dùng giá trị mặc định.'}</p>{message && <p role="alert" className="booking-alert is-error">{message}</p>}<button className="button-primary" disabled={busy || Number(value) === policy.value}>{busy ? 'Đang lưu…' : 'Lưu chính sách'}</button></form>;
}

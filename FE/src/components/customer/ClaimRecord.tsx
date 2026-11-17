import { useState } from 'react';
import { mutate } from '../../services/portal';
import { money } from '../manager/portal-data';
import { formatPortalDate } from './CustomerPortalHelpers';

export type Claim = { id: string; claimCode: string; status: string; discoveredOn: string; unitCodeSnapshot: string; description: string; updatedAt: string; estimatedValue: number | null; affectedItems: { id: string; name: string; unit: string }[]; evidenceLinks: string[]; staffFacts: string | null; decisionReason: string | null; resolutionNote: string | null; decision: string | null; customer?: { fullName: string; phone: string } };
const states: Record<string, string> = { REPORTED: 'Đã gửi · chờ kiểm tra', INVESTIGATING: 'Đang xác minh thực tế', APPROVED: 'Đã chấp thuận hướng xử lý', REJECTED: 'Chưa chấp thuận đề nghị', RESOLVED: 'Đã thông báo kết quả' };
type EditKind = 'facts' | 'decision' | 'resolve' | 'amend-decision' | 'amend-resolution';
export function ClaimRecord({ claim, root, role, saved }: { claim: Claim; root: string; role: string; saved: () => void }) {
  const staffStep = role === 'STAFF' && ['REPORTED', 'INVESTIGATING'].includes(claim.status);
  const [editing, setEditing] = useState<EditKind | null>(staffStep && !claim.staffFacts ? 'facts' : role === 'MANAGER' && claim.status === 'INVESTIGATING' ? 'decision' : null);
  const [note, setNote] = useState(staffStep ? claim.staffFacts ?? '' : claim.decisionReason ?? '');
  const [decision, setDecision] = useState(claim.decision ?? 'APPROVED'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const edit = (kind: EditKind, value: string | null) => { setNote(value ?? ''); setEditing(kind); setError(''); };
  const title = editing === 'facts' ? 'Những gì đã kiểm tra tại kho' : editing === 'resolve' || editing === 'amend-resolution' ? 'Kết quả đã trao đổi với khách' : 'Lý do và hướng xử lý';
  const submit = async () => {
    if (busy || !editing) return;
    setBusy(true); setError('');
    const payload = editing === 'facts' ? { staffFacts: note } : editing === 'decision' ? { decision, decisionReason: note }
      : editing === 'amend-decision' ? { action: editing, decisionReason: note }
      : { action: editing === 'resolve' ? 'resolve' : editing, resolutionNote: note };
    try { await mutate(`${root}/${claim.id}`, 'PATCH', { expectedUpdatedAt: claim.updatedAt, ...payload }); setEditing(null); saved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa lưu được.'); }
    finally { setBusy(false); }
  };
  return <article className="manager-section damage-claim-record claim-review-card">
    <header className="claim-review-heading"><div><small>{claim.claimCode}</small><h2>Sự cố tại kho {claim.unitCodeSnapshot}</h2></div><span className={`claim-status is-${claim.status.toLowerCase()}`}>{states[claim.status] ?? claim.status}</span></header>
    <dl className="claim-review-facts">
      {claim.customer && <div><dt>Khách hàng</dt><dd>{claim.customer.fullName}<small>{claim.customer.phone}</small></dd></div>}
      <div><dt>Ngày phát hiện</dt><dd>{formatPortalDate(claim.discoveredOn)}</dd></div>
      {claim.estimatedValue !== null && <div><dt>Giá trị khách ước tính</dt><dd>{money(claim.estimatedValue)}<small>Giá trị do khách cung cấp</small></dd></div>}
    </dl>
    <section className="claim-review-description"><h3>Tình trạng khách báo</h3><p>{claim.description}</p>
      {claim.affectedItems.length > 0 && <ul className="claim-item-tags">{claim.affectedItems.map(item => <li key={item.id}>{item.name} · {item.unit}</li>)}</ul>}
      {claim.evidenceLinks.length > 0 && <div className="portal-actions">{claim.evidenceLinks.map((link, index) => <a key={link} href={link} target="_blank" rel="noopener noreferrer">Chứng cứ {index + 1}</a>)}</div>}
    </section>
    <div className="claim-review-results">
      {claim.staffFacts && <section><h3>Ghi nhận tại kho</h3><p>{claim.staffFacts}</p>{staffStep && !editing && <button className="portal-text-button" onClick={() => edit('facts', claim.staffFacts)}>Chỉnh sửa ghi nhận</button>}</section>}
      {claim.decisionReason && <section><h3>Lý do quyết định</h3><p>{claim.decisionReason}</p>{role === 'MANAGER' && !editing && <button className="portal-text-button" onClick={() => edit('amend-decision', claim.decisionReason)}>Chỉnh sửa lý do quyết định</button>}</section>}
      {claim.resolutionNote && <section><h3>Kết quả</h3><p>{claim.resolutionNote}</p>{role === 'MANAGER' && claim.status === 'RESOLVED' && !editing && <button className="portal-text-button" onClick={() => edit('amend-resolution', claim.resolutionNote)}>Chỉnh sửa kết quả</button>}</section>}
    </div>
    {role === 'MANAGER' && ['APPROVED', 'REJECTED'].includes(claim.status) && !editing && <button className="button-primary" onClick={() => edit('resolve', '')}>Ghi nhận kết quả và hoàn tất</button>}
    {editing && <form className="portal-form claim-record-editor" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <h3>{editing.startsWith('amend') ? 'Chỉnh sửa nội dung đã lưu' : editing === 'facts' ? 'Xác minh của nhân viên' : 'Xem xét của quản lý'}</h3>
      {editing === 'decision' && <label className="field-label">Hướng xử lý<select value={decision} onChange={event => setDecision(event.target.value)} disabled={busy}><option value="APPROVED">Chấp thuận hướng xử lý</option><option value="REJECTED">Chưa chấp thuận đề nghị</option></select></label>}
      <label className="field-label">{title}<textarea required minLength={10} maxLength={3000} disabled={busy} rows={3} value={note} onChange={event => setNote(event.target.value)} /></label>
      {error && <p role="alert" className="booking-alert is-error">{error}</p>}
      <div className="portal-actions"><button className="button-primary" disabled={busy}>{busy ? 'Đang lưu…' : editing === 'facts' ? 'Lưu ghi nhận để quản lý xem xét' : editing === 'decision' ? 'Lưu quyết định' : editing === 'resolve' ? 'Hoàn tất hồ sơ' : 'Lưu chỉnh sửa'}</button><button className="button-secondary" type="button" disabled={busy} onClick={() => setEditing(null)}>Hủy chỉnh sửa</button></div>
    </form>}
    {staffStep && !claim.staffFacts && !editing && <button className="button-primary" onClick={() => edit('facts', '')}>Nhập ghi nhận tại kho</button>}
    {role === 'MANAGER' && claim.status === 'INVESTIGATING' && !editing && <button className="button-primary" onClick={() => edit('decision', claim.decisionReason)}>Xem xét và lưu quyết định</button>}
  </article>;
}

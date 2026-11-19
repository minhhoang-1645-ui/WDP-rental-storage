import { useId, useRef, useState, type FormEvent } from 'react';
import { Modal, RecordPicker } from '../../components/manager/PortalUi';
import { code, first, label, type Row } from '../../components/manager/portal-data';
import { mutate } from '../../services/portal';
import { OperationsLink as Link } from '../../components/manager/OperationsLink';
import { useAuth } from '../../auth/auth-context';

export function ManagerCreateDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (created: Row) => void }) {
  const { user } = useAuth();
  const formId = useId(), lock = useRef(false);
  const [target, setTarget] = useState('');
  const [category, setCategory] = useState('UNIT_DAMAGE');
  const [priority, setPriority] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current || !target || user?.role !== 'STAFF') return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      onSuccess(await mutate<Row>('/staff/management/maintenance', 'POST', { storageUnitId: target, category, priority, description: description.trim() }, true));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tạo yêu cầu.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return <Modal title="Tạo yêu cầu bảo trì" onClose={onClose} busy={busy} footer={<>
    <button type="button" className="button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
    <button type="submit" form={formId} className="button-primary" disabled={busy || !target || !description.trim()}>{busy ? 'Đang tạo…' : 'Tạo yêu cầu'}</button>
  </>}>
    <form id={formId} className="portal-form" onSubmit={submit}>
      <p>Tạo bảo trì cho kho trống. Với kho đang cho thuê, mở yêu cầu sự cố của khách để kiểm tra.</p>
      <div className="portal-actions"><Link className="button-secondary" to="/manager/operations/rentals">Tra cứu kho đang thuê</Link><Link className="button-secondary" to="/manager/operations/support-requests">Mở yêu cầu sự cố của khách</Link></div>
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
      <fieldset disabled={busy}>
        <RecordPicker path="/manager/units?status=AVAILABLE" title="Kho cần bảo trì" value={target} local onChange={setTarget}
          accept={row => !/^(?:appointment|billing|settlement|return|renew|test|manager|overdue|maintenance)-product-[0-9a-f]{8}$/i.test(first(row, 'storageType.id')) && !/^DEMO-(?:SM|MD|LG|LK)-/.test(code(row))}
          describe={row => [code(row), first(row, 'storageType.name'), [first(row, 'floor'), first(row, 'zone')].filter(Boolean).join(' ')].filter(Boolean).join(' · ')} />
        <label className="field-label">Hạng mục<select value={category} onChange={event => setCategory(event.target.value)}>
          {['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'].map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></label>
        <label className="field-label">Ưu tiên<select value={priority} onChange={event => setPriority(event.target.value)}>
          {['LOW', 'MEDIUM', 'HIGH'].map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></label>
        <label className="field-label">Mô tả tình trạng<textarea rows={4} required maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} /></label>
      </fieldset>
    </form>
  </Modal>;
}

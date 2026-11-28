import { useId, useRef, useState, type FormEvent } from 'react';
import { Modal, RecordPicker } from '../../components/manager/PortalUi';
import { first, label, type Row } from '../../components/manager/portal-data';
import { mutate } from '../../services/portal';
import { useAuth } from '../../auth/auth-context';

export function ManagerCreateDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (created: Row) => void }) {
  const { user } = useAuth();
  const formId = useId(), lock = useRef(false);
  const [target, setTarget] = useState('');
  const [category, setCategory] = useState('UNIT_DAMAGE');
  const [priority, setPriority] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [evidenceLink, setEvidenceLink] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current || !target || user?.role !== 'FACILITY_STAFF') return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      onSuccess(await mutate<Row>('/staff/maintenance', 'POST', {
        storageUnitId: target, category, priority, description: description.trim(), evidenceLink: evidenceLink.trim() || undefined,
      }, true));
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
      <p>Chọn kho thuộc cơ sở bạn được cấp quyền. Quản lý sẽ phân công người sửa.</p>
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
      <fieldset disabled={busy}>
        <RecordPicker path="/staff/maintenance/units" title="Kho cần bảo trì" value={target} onChange={setTarget}
          describe={row => [first(row, 'unitCode'), first(row, 'storageType.facility.name'), label(row.status)].filter(Boolean).join(' · ')} />
        <label className="field-label">Hạng mục<select value={category} onChange={event => setCategory(event.target.value)}>
          {['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'].map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></label>
        <label className="field-label">Ưu tiên<select value={priority} onChange={event => setPriority(event.target.value)}>
          {['LOW', 'MEDIUM', 'HIGH'].map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></label>
        <label className="field-label">Mô tả tình trạng<textarea rows={4} required maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label className="field-label">Liên kết ảnh sự cố (tùy chọn)<input type="url" pattern="https://.+" maxLength={1000} value={evidenceLink}
          onChange={event => setEvidenceLink(event.target.value)} /></label>
      </fieldset>
    </form>
  </Modal>;
}

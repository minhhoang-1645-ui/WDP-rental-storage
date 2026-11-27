import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowRight, ImagePlus, MapPin, Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { SESSION_ENDED_EVENT } from '../../auth/session-end';
import { date, first, label, type Page, type Row } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, Pagination, Status } from '../../components/manager/PortalUi';
import { apiRequest, ApiError } from '../../services/api';
import { allPages } from '../../services/portal';
import { useApiResource } from '../../services/useApiResource';
import { incidentArea, incidentAreas, incidentCategories, rentalImpacts } from '../../utils/maintenance-incident';
import { staffFacilityMessage, useStaffFacility } from './staff-facility';

type Unit = { id: string; unitCode: string; status: string };
type Preview = { file: File; url: string };
type IncidentDraft = { description: string; category: string; areaMode: boolean; priority: string; impact: string; files: File[] };
const pendingDrafts = new Map<string, IncidentDraft>();
const fileTypes = ['image/jpeg', 'image/png', 'image/webp'];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const detailHref = (row: Row) => '/staff/maintenance/' + encodeURIComponent(first(row, 'id')) + '?from=report-issue';

export function StaffIssueReportPage() {
  const { user } = useAuth();
  return user ? <IssueReport key={user.id} userId={user.id} /> : null;
}

function IssueReport({ userId }: { userId: string }) {
  const [draft, setDraft] = useState(() => pendingDrafts.get(userId));
  const formRef = useRef<HTMLFormElement>(null);
  const facilities = useStaffFacility(userId);
  const selected = facilities.facility?.id ?? '';
  const [areaMode, setAreaMode] = useState(draft?.areaMode ?? false);
  const [area, setArea] = useState('');
  const [priority, setPriority] = useState(draft?.priority ?? 'MEDIUM');
  const [impact, setImpact] = useState(draft?.impact ?? '');
  const [affectedUnits, setAffectedUnits] = useState<string[]>([]);
  const needsAreaScope = areaMode && ['AFFECTED', 'UNKNOWN'].includes(impact);
  const [revision, setRevision] = useState(0);
  const [formVersion, setFormVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [reportQuery, setReportQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const reportParams = new URLSearchParams({ page: String(page), limit: '10', facilityId: selected, search: reportQuery });
  const reports = useApiResource<Page<Row>>(selected ? '/staff/maintenance/reported-by-me?' + reportParams : null, userId, true);
  const [units, setUnits] = useState<{ facility: string; items: Unit[]; error: string }>();
  const currentUnits = units?.facility === selected ? units : undefined;
  const [photos, setPhotos] = useState<Preview[]>([]);
  const photoUrls = useRef(new Set<string>());
  const [photoError, setPhotoError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Row>();
  const request = useRef<{ signature: string; key: string } | undefined>(undefined);
  const lock = useRef(false);

  useEffect(() => {
    const urls = photoUrls.current;
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);
  useEffect(() => {
    const files = pendingDrafts.get(userId)?.files ?? [];
    if (!files.length) return;
    setPhotos(files.map(file => {
      const url = URL.createObjectURL(file);
      photoUrls.current.add(url);
      return { file, url };
    }));
  }, [userId]);
  useEffect(() => {
    const saveOnSessionEnd = () => {
      if (!formRef.current) return;
      const values = new FormData(formRef.current);
      const description = String(formRef.current.querySelector<HTMLTextAreaElement>('textarea[name="description"]')?.value ?? '');
      const category = formRef.current.querySelector<HTMLSelectElement>('select[name="category"]')?.value ?? String(values.get('category') ?? '');
      if (description || category || photos.length) {
        pendingDrafts.set(userId, { description, category, areaMode, priority, impact, files: photos.map(photo => photo.file) });
      }
    };
    window.addEventListener(SESSION_ENDED_EVENT, saveOnSessionEnd);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, saveOnSessionEnd);
  }, [userId, areaMode, photos, priority, impact]);
  useEffect(() => {
    if (!selected || areaMode && !needsAreaScope) return;
    const controller = new AbortController();
    void allPages<Unit>('/staff/maintenance/units?facilityId=' + encodeURIComponent(selected), controller.signal)
      .then(result => { if (!controller.signal.aborted) setUnits({ facility: selected, items: result.items, error: '' }); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setUnits({ facility: selected, items: [], error: cause instanceof Error ? cause.message : 'Không tải được danh sách ô kho.' });
      });
    return () => controller.abort();
  }, [selected, areaMode, needsAreaScope, revision]);

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    if (photos.length + files.length > 5) { setPhotoError('Chỉ được chọn tối đa 5 ảnh.'); return; }
    if (files.some(file => !fileTypes.includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)) {
      setPhotoError('Chỉ nhận ảnh JPG, PNG hoặc WebP hợp lệ, tối đa 5 MB mỗi ảnh.');
      return;
    }
    setPhotos([...photos, ...files.map(file => {
      const url = URL.createObjectURL(file);
      photoUrls.current.add(url);
      return { file, url };
    })]);
    request.current = undefined;
    setPhotoError('');
  }

  function removePhoto(url: string) {
    URL.revokeObjectURL(url);
    photoUrls.current.delete(url);
    setPhotos(photos.filter(photo => photo.url !== url));
    request.current = undefined;
    setPhotoError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const description = String(data.get('description') ?? '').trim();
    const category = String(data.get('category') ?? '');
    if (!Object.hasOwn(rentalImpacts, impact) || needsAreaScope && !affectedUnits.length) {
      setError('Xác định mức ảnh hưởng và chọn các ô bị ảnh hưởng nếu cần.');
      return;
    }
    if (!Object.hasOwn(incidentCategories, category) || description.length < 3
      || (areaMode ? !area || area === 'OTHER' && !String(data.get('locationNote') ?? '').trim()
        : !currentUnits?.items.some(unit => unit.id === data.get('storageUnitId')))) {
      setError('Chọn vị trí, loại sự cố và nhập mô tả có ít nhất 3 ký tự.');
      return;
    }
    data.delete('locationMode');
    data.set('description', description);
    data.set('facilityId', selected);
    if (needsAreaScope) data.set('affectedUnitIds', JSON.stringify(affectedUnits));
    const signature = JSON.stringify([...data.entries()]);
    if (request.current?.signature !== signature) request.current = { signature, key: 'incident-' + crypto.randomUUID() };
    photos.forEach(photo => data.append('photos', photo.file));
    lock.current = true;
    setBusy(true);
    setError('');
    setReceipt(undefined);
    try {
      const row = await apiRequest<Row>('/staff/maintenance', { method: 'POST', body: data, timeoutMs: 90000,
        headers: { 'Idempotency-Key': request.current.key } });
      photoUrls.current.forEach(url => URL.revokeObjectURL(url));
      photoUrls.current.clear();
      setPhotos([]);
      setPhotoError('');
      request.current = undefined;
      setPriority('MEDIUM');
      setImpact('');
      setAffectedUnits([]);
      setArea('');
      setDraft(undefined);
      setFormVersion(value => value + 1);
      pendingDrafts.delete(userId);
      setReceipt(row);
      setPage(1);
      reports.refresh();
    } catch (cause) {
      const denied = cause instanceof ApiError && [403, 404].includes(cause.status);
      setError(denied ? 'Bạn không còn quyền báo sự cố tại vị trí này. Nội dung đã nhập vẫn được giữ.'
        : cause instanceof Error ? cause.message : 'Không gửi được báo cáo. Vui lòng thử lại.');
      if (denied) facilities.refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <section className="staff-incident-page">
    <PageHeader title="Báo cáo sự cố" />
    <LoadState loading={facilities.loading} error={facilities.error} retry={facilities.refresh} />
    {staffFacilityMessage(facilities) && <Empty title={staffFacilityMessage(facilities)} description="Liên hệ quản trị viên để kiểm tra quyền cơ sở." />}
    {(selected || error || draft) && <section className="manager-section">
      {draft && <p className="booking-alert">Nội dung từ phiên trước đã được giữ. Chọn lại vị trí theo quyền cơ sở hiện tại.</p>}
      <form key={formVersion} ref={formRef} className="portal-form" onSubmit={submit} aria-busy={busy}>
        <fieldset className="portal-action-fieldset" disabled={busy}>
          <p className="staff-facility-label"><MapPin size={17} aria-hidden="true" />{facilities.facility?.name ?? 'Cơ sở chưa xác định'}</p>
          <div className="incident-location">
            <h2>Vị trí xảy ra sự cố</h2>
            <div className="incident-location-options" role="radiogroup" aria-label="Vị trí xảy ra sự cố">
              <label><input name="locationMode" value="unit" type="radio" checked={!areaMode} onChange={() => { setAffectedUnits([]); setAreaMode(false); }} /><Warehouse size={19} aria-hidden="true" />Ô kho cụ thể</label>
              <label><input name="locationMode" value="area" type="radio" checked={areaMode} onChange={() => { setArea(''); setAreaMode(true); }} /><MapPin size={19} aria-hidden="true" />Khu vực chung</label>
            </div>
            {areaMode ? <>
              <label className="field-label">Khu vực chung<select aria-label="Khu vực chung" key={selected} name="commonArea" required value={selected ? area : ''} onChange={event => setArea(event.target.value)}>
                <option value="">Chọn khu vực</option>
                {Object.entries(incidentAreas).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select></label>
              <label className="field-label">Mô tả vị trí{area !== 'OTHER' && ' (tùy chọn)'}<input key={selected} name="locationNote" required={area === 'OTHER'}
                maxLength={500} placeholder="Ví dụ: Hành lang tầng 2, gần thang máy" /></label>
            </> : <>
              <label className="field-label">Ô kho<select aria-label="Ô kho" key={selected} name="storageUnitId" required disabled={!selected || !currentUnits}>
                <option value="">Chọn ô kho</option>
                {currentUnits?.items.map(unit => <option key={unit.id} value={unit.id}>{unit.unitCode} · {label(unit.status)}</option>)}
              </select></label>
              {selected && <LoadState loading={!currentUnits} error={currentUnits?.error ?? ''} retry={() => { setUnits(undefined); setRevision(value => value + 1); }} />}
              {currentUnits && !currentUnits.error && !currentUnits.items.length && <small>Cơ sở chưa có ô kho. Bạn có thể báo sự cố khu vực chung.</small>}
            </>}
          </div>
          <label className="field-label">Ảnh hưởng đến khả năng cho thuê
            <select aria-label="Ảnh hưởng đến khả năng cho thuê" name="rentalImpact" value={impact} required
              onChange={event => { setImpact(event.target.value); setAffectedUnits([]); }}>
              <option value="" disabled>Chọn mức ảnh hưởng</option>
              {Object.entries(rentalImpacts).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          {['AFFECTED', 'UNKNOWN'].includes(impact) && <p className="booking-alert">Các ô bị ảnh hưởng sẽ tạm ngừng nhận đặt thuê ngay khi gửi phiếu. Đơn đặt và hợp đồng hiện có vẫn được giữ.</p>}
          {needsAreaScope && <div className="incident-location">
            <h2>Ô kho bị ảnh hưởng hoặc cần xác minh</h2>
            <p>Chọn các ô trong phạm vi sự cố. Vị trí báo cáo vẫn là khu vực chung.</p>
            <LoadState loading={Boolean(selected && !currentUnits)} error={currentUnits?.error ?? ''} retry={() => { setUnits(undefined); setRevision(value => value + 1); }} />
            <div className="incident-unit-options">
              {currentUnits?.items.map(unit => <label key={unit.id}>
                <input type="checkbox" checked={affectedUnits.includes(unit.id)} onChange={event => setAffectedUnits(ids =>
                  event.target.checked ? [...ids, unit.id] : ids.filter(id => id !== unit.id))} /> {unit.unitCode} · {label(unit.status)}
              </label>)}
            </div>
          </div>}
          <div className="incident-two-fields">
            <label className="field-label">Loại sự cố<select aria-label="Loại sự cố" name="category" required defaultValue={draft?.category ?? ''}>
              <option value="" disabled>Chọn loại sự cố</option>
              {Object.entries(incidentCategories).map(([value, text]) => <option value={value} key={value}>{text}</option>)}
            </select></label>
            <label className="field-label">Mức ưu tiên đề xuất<select aria-label="Mức ưu tiên đề xuất" name="priority" value={priority} onChange={event => setPriority(event.target.value)}>
              {priorities.map(value => <option value={value} key={value}>{label(value)}</option>)}
            </select></label>
          </div>
          <small>Chọn Khẩn cấp khi có nguy hiểm tức thời như cháy, rò điện hoặc đe dọa an toàn.</small>
          {priority === 'URGENT' && <p className="booking-alert" role="alert">Giữ khoảng cách an toàn, báo ngay cho quản lý tại cơ sở và gọi lực lượng khẩn cấp khi cần. Gửi phiếu sau khi đã xử lý nguy cơ tức thời.</p>}
          <label className="field-label">Mô tả sự cố<textarea name="description" minLength={3} maxLength={4000} rows={4} required defaultValue={draft?.description ?? ''}
            placeholder="Mô tả hiện trạng và thời điểm phát hiện" /></label>
          <div className="incident-upload">
            <strong>Ảnh sự cố <small>(tùy chọn)</small></strong>
            <input ref={fileInput} hidden type="file" accept={fileTypes.join(',')} multiple onChange={addPhotos} />
            <input ref={cameraInput} hidden type="file" accept={fileTypes.join(',')} capture="environment" onChange={addPhotos} />
            <button type="button" className="button-secondary" disabled={photos.length >= 5} onClick={() => cameraInput.current?.click()}>Chụp ảnh</button>
            <div><button type="button" className="button-secondary" disabled={photos.length >= 5} onClick={() => fileInput.current?.click()}>
              <ImagePlus size={17} aria-hidden="true" /> Thêm ảnh
            </button> <small>{photos.length}/5 ảnh · JPG, PNG hoặc WebP · Tối đa 5 MB/ảnh</small></div>
          </div>
          {photoError && <p className="booking-alert is-error" role="alert">{photoError}</p>}
          {photos.length > 0 && <ul className="incident-photos">{photos.map(({ file, url }, index) => <li key={url}>
            <img src={url} alt={'Ảnh sự cố ' + (index + 1)} />
            <button type="button" className="button-secondary" aria-label={'Xóa ảnh ' + file.name} onClick={() => removePhoto(url)}>Xóa ảnh</button>
          </li>)}</ul>}
          <button type="submit" className="button-primary" disabled={!selected || facilities.loading || facilities.refreshing || Boolean(facilities.error) || !areaMode && !currentUnits?.items.length}>
            {busy ? 'Đang gửi…' : 'Gửi báo cáo'}
          </button>
        </fieldset>
      </form>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
      {receipt && <p className="portal-success" role="status">Đã gửi {first(receipt, 'maintenanceCode')} · Chờ quản lý phân công. {Boolean(receipt.blocksUnit) && 'Đã tạm chặn đặt thuê các ô bị ảnh hưởng. '}<Link className="button-secondary incident-detail-link" to={detailHref(receipt)}>Xem chi tiết <ArrowRight size={15} aria-hidden="true" /></Link></p>}
    </section>}
    {selected && <section className="manager-section">
      <PageHeader title="Sự cố tôi đã báo"><button className="button-secondary" type="button" disabled={reports.loading || reports.refreshing} onClick={reports.refresh}>Làm mới</button></PageHeader>
      <form className="incident-report-search" onSubmit={event => { event.preventDefault(); setPage(1); setReportQuery(search.trim()); }}>
        <label className="field-label">Tìm phiếu sự cố<input type="search" placeholder="Mã phiếu hoặc mã ô kho" value={search} maxLength={100}
          onChange={event => { setSearch(event.target.value); if (!event.target.value) { setPage(1); setReportQuery(''); } }} /></label>
        <button type="submit" className="button-secondary">Tìm kiếm</button>
        {reportQuery && <button type="button" className="button-secondary" onClick={() => { setSearch(''); setReportQuery(''); setPage(1); }}>Xóa tìm kiếm</button>}
      </form>
      <LoadState loading={reports.loading} error={reports.error} retry={reports.refresh} />
      {reports.data?.items.length === 0 && <Empty title={reportQuery ? 'Không tìm thấy phiếu sự cố phù hợp' : 'Bạn chưa báo sự cố nào tại cơ sở này'} />}
      {Boolean(reports.data?.items.length) && <div className="manager-table-wrap"><table className="manager-table" aria-label="Sự cố tôi đã báo">
        <thead><tr><th>Phiếu sự cố</th><th>Cơ sở và vị trí</th><th>Ngày báo</th><th>Ưu tiên</th><th>Tiến độ</th><th>Nhận đặt kho</th><th>Nhân viên được giao</th><th>Thao tác</th></tr></thead>
        <tbody>{reports.data?.items.map(row => <tr key={first(row, 'id')}>
          <td><strong>{first(row, 'maintenanceCode')}</strong><br />{label(row.category)}</td>
          <td>{[first(row, 'facility.name'), first(row, 'unitCode') || incidentArea(row.commonArea), first(row, 'locationNote')].filter(Boolean).join(' · ')}</td>
          <td>{date(row.createdAt, true)}</td><td>{label(row.priority)}</td><td><Status value={row.status} text={row.status === 'OPEN' ? (first(row, 'assignedStaff.fullName') ? 'Chờ xử lý' : 'Chờ phân công') : undefined} /></td>
          <td>{row.blocksUnit === true ? <span className="incident-booking-hold">Tạm dừng nhận đặt</span> : <span className="incident-booking-clear">Không chặn đặt</span>}</td>
          <td>{first(row, 'assignedStaff.fullName') || 'Chờ quản lý giao việc'}</td>
          <td><Link className="button-secondary incident-detail-link" to={detailHref(row)}>Xem chi tiết <ArrowRight size={15} aria-hidden="true" /></Link></td>
        </tr>)}</tbody>
      </table></div>}
      {reports.data && <Pagination page={page} limit={10} total={reports.data.total} onChange={setPage} />}
    </section>}
  </section>;
}

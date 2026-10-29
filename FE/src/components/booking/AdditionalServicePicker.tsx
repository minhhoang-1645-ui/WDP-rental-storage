import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../services/api';
import type { AdditionalService, ServiceInventory, ServiceSelection } from '../../types/additional-service';
import { defaultServiceSelection, serviceEstimatedTotal, serviceBillingBasis, serviceSelectionIssue } from '../../utils/service-period';
import { localizeService } from '../../utils/service-labels';

function serviceGroup(service: AdditionalService): 'DAY' | 'MONTH' | 'ONE_TIME' {
  return service.billingUnit;
}

export function AdditionalServicePicker({ services: rawServices, selections, startDate, endDate, onChange }: {
  services: AdditionalService[];
  selections: ServiceSelection[];
  startDate: string;
  endDate: string;
  onChange: (value: ServiceSelection[]) => void;
}) {
  const services = useMemo(() => rawServices.map(localizeService), [rawServices]);
  const [activeKind, setActiveKind] = useState<'DAY' | 'MONTH' | 'ONE_TIME'>('DAY');
  const [state, setState] = useState<{ key: string; error: string; items: ServiceInventory[] }>();
  const issues = useMemo(() => new Map(selections.map(selection => [selection.serviceId, serviceSelectionIssue(services.find(service => service.id === selection.serviceId), selection, startDate, endDate)])), [services, selections, startDate, endDate]);
  const validSelections = useMemo(() => selections.filter(selection => !issues.get(selection.serviceId)), [issues, selections]);
  const key = JSON.stringify({ selections, startDate, endDate });
  useEffect(() => {
    if (!validSelections.length) return;
    const controller = new AbortController();
    Promise.all(validSelections.map(selection => {
      const query = new URLSearchParams({ quantity: String(selection.quantity) });
      if (selection.serviceStartDate) query.set('startDate', selection.serviceStartDate);
      if (selection.serviceEndDate) query.set('endDate', selection.serviceEndDate);
      return apiRequest<ServiceInventory>(`/additional-services/${encodeURIComponent(selection.serviceId)}/availability?${query}`, { signal: controller.signal, authenticated: false });
    })).then(items => { if (!controller.signal.aborted) setState({ key, items, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, items: [], error: error instanceof Error ? error.message : 'Không kiểm tra được dịch vụ.' }); });
    return () => controller.abort();
  }, [key, validSelections]);
  const change = (serviceId: string, patch: Partial<ServiceSelection>) => onChange(selections.map(item => item.serviceId === serviceId ? { ...item, ...patch } : item));
  const removedSelections = selections.filter(selection => !services.some(service => service.id === selection.serviceId));
  if (!services.length) return <div className="addon-empty">Chưa có dịch vụ bổ sung được NestBox duyệt{selections.length > 0 && <button type="button" className="button-secondary" onClick={() => onChange([])}>Xóa dịch vụ không còn trong danh mục</button>}</div>;
  const groups = [
    { kind: 'DAY', title: 'Thiết bị thuê theo ngày', description: 'Tính theo số ngày sử dụng thực tế; đây là thiết bị, không gồm nhân công bốc xếp.' },
    { kind: 'MONTH', title: 'Thiết bị thuê theo tháng', description: 'Tính theo tháng trọn kỳ của dịch vụ.' },
    { kind: 'ONE_TIME', title: 'Vật tư mua một lần', description: 'Tính một lần theo số lượng mua.' },
  ] as const;
  const serviceGroups = groups.map(group => ({ ...group, services: services.filter(service => serviceGroup(service) === group.kind) }));
  const activeGroup = serviceGroups.find(group => group.kind === activeKind && group.services.length) ?? serviceGroups.find(group => group.services.length) ?? serviceGroups[0];
  return <div className="addon-service-picker">
    <div className="addon-service-tabs" role="group" aria-label="Loại dịch vụ bổ sung">
      {serviceGroups.map(group => <button type="button" disabled={!group.services.length} className={group.kind === activeGroup.kind ? 'addon-service-tab is-selected' : 'addon-service-tab'} aria-pressed={group.kind === activeGroup.kind} aria-controls={`addon-service-panel-${group.kind.toLowerCase()}`} key={group.kind} onClick={() => setActiveKind(group.kind)}>
        <span>{group.title}</span><small>{group.services.length} dịch vụ</small>
      </button>)}
    </div>
    {selections.some(selection => issues.get(selection.serviceId)) && <p className="booking-alert" role="alert">Có dịch vụ chưa hợp lệ: {selections.filter(selection => issues.get(selection.serviceId)).map(selection => `${services.find(service => service.id === selection.serviceId)?.name ?? 'Dịch vụ đã chọn'}: ${issues.get(selection.serviceId)}`).join(' ')}</p>}
    {removedSelections.length > 0 && <button type="button" className="button-secondary" onClick={() => onChange(selections.filter(selection => services.some(service => service.id === selection.serviceId)))}>Xóa dịch vụ không còn trong danh mục</button>}
    <div className="addon-service-scroll" key={activeGroup.kind}>
      <section className="addon-service-group" id={`addon-service-panel-${activeGroup.kind.toLowerCase()}`}>
        <header className="addon-service-group-heading"><div><h4>{activeGroup.title}</h4><p>{activeGroup.description}</p></div><span>{activeGroup.services.length}</span></header>
        {activeGroup.services.length ? <div className="addon-service-items">{activeGroup.services.map(service => {
          const selected = selections.find(item => item.serviceId === service.id);
          const inventory = state?.key === key ? state.items.find(item => item.serviceId === service.id) : undefined;
          const isRental = service.kind === 'RENTAL';
          const issue = issues.get(service.id);
          const suggested = defaultServiceSelection(service, startDate, endDate);
          const subtotal = selected ? serviceEstimatedTotal(service, selected, startDate, endDate) : null;
          return <div className="addon-service-item" key={service.id}>
            <label className="booking-checkbox"><input aria-label={service.name} type="checkbox" checked={Boolean(selected)} disabled={!selected && (!suggested || service.isActive === false || service.unitPrice === null || service.unitPrice <= 0)} onChange={event => onChange(event.target.checked && suggested ? [...selections, suggested] : selections.filter(item => item.serviceId !== service.id))} /><span><strong>{service.name}</strong><small>{service.unitPrice === null ? 'Cần xác nhận báo giá' : `${new Intl.NumberFormat('vi-VN').format(service.unitPrice)} đ / ${service.billingUnit === 'DAY' ? 'ngày' : service.billingUnit === 'MONTH' ? 'tháng lịch' : 'sản phẩm'}`}</small>{service.description && <small>{service.description}</small>}{!suggested && isRental && <small>Chọn kỳ thuê kho phù hợp; thiết bị theo tháng cần ít nhất một tháng lịch.</small>}</span></label>
            {selected && <div className="checkout-fields">
              <label className="field-label">Số lượng {service.name}<input type="number" min={1} max={100} step={1} required value={selected.quantity} onChange={event => change(service.id, { quantity: Number(event.target.value) })} /></label>
              {isRental && <><label className="field-label">Ngày bắt đầu {service.name}<input type="date" required min={startDate} max={endDate} value={selected.serviceStartDate ?? ''} onChange={event => change(service.id, { serviceStartDate: event.target.value })} /></label><label className="field-label">Ngày kết thúc {service.name}<input type="date" required min={selected.serviceStartDate || startDate} max={endDate} value={selected.serviceEndDate ?? ''} onChange={event => change(service.id, { serviceEndDate: event.target.value })} /></label></>}
              <p className="field-help">{serviceBillingBasis(service, selected)}</p>
              {subtotal !== null && <p className="addon-subtotal">Tạm tính: <strong>{new Intl.NumberFormat('vi-VN').format(subtotal)} đ</strong> · Đối chiếu báo giá ở bên cạnh.</p>}
              {isRental && suggested && <button type="button" className="portal-text-button" onClick={() => change(service.id, suggested)}>Đặt lại kỳ sử dụng theo kho</button>}
              <p role={issue ? 'alert' : 'status'}>{issue || (state?.key === key && state.error ? state.error : inventory ? inventory.available ? 'Dịch vụ còn đáp ứng; kiểm tra này chưa giữ hàng.' : 'Dịch vụ không đủ tồn kho hoặc công suất.' : 'Đang kiểm tra dịch vụ…')}</p>
            </div>}
          </div>;
        })}</div> : <div className="addon-service-empty">Chưa có dịch vụ thuộc nhóm này.</div>}
      </section>
    </div>
  </div>;
}

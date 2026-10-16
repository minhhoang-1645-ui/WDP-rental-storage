import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../services/api';
import type { AdditionalService, ServiceInventory, ServiceSelection } from '../../types/additional-service';
import { serviceBillingBasis, serviceSelectionIssue } from '../../utils/service-period';

function serviceKind(service: AdditionalService): 'RENTAL' | 'PURCHASE' {
  return service.kind;
}

export function AdditionalServicePicker({ services, selections, startDate, endDate, onChange }: {
  services: AdditionalService[];
  selections: ServiceSelection[];
  startDate: string;
  endDate: string;
  onChange: (value: ServiceSelection[]) => void;
}) {
  const [activeKind, setActiveKind] = useState<'RENTAL' | 'PURCHASE'>('RENTAL');
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
  if (!services.length) return <div className="addon-empty">Chưa có dịch vụ bổ sung được WDP duyệt{selections.length > 0 && <button type="button" className="button-secondary" onClick={() => onChange([])}>Xóa dịch vụ không còn trong danh mục</button>}</div>;
  const groups = [
    { kind: 'RENTAL', title: 'Thuê theo ngày / tháng', description: 'Thiết bị thuê được tính theo thời gian sử dụng.' },
    { kind: 'PURCHASE', title: 'Mua một lần', description: 'Sản phẩm mua được tính một lần theo số lượng.' },
  ] as const;
  const serviceGroups = groups.map(group => ({ ...group, services: services.filter(service => serviceKind(service) === group.kind) }));
  const activeGroup = serviceGroups.find(group => group.kind === activeKind) ?? serviceGroups[0]!;
  return <div className="addon-service-picker">
    <div className="addon-service-tabs" role="group" aria-label="Loại dịch vụ bổ sung">
      {serviceGroups.map(group => <button type="button" className={group.kind === activeGroup.kind ? 'addon-service-tab is-selected' : 'addon-service-tab'} aria-pressed={group.kind === activeGroup.kind} aria-controls={`addon-service-panel-${group.kind.toLowerCase()}`} key={group.kind} onClick={() => setActiveKind(group.kind)}>
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
          const isRental = serviceKind(service) === 'RENTAL';
          const issue = issues.get(service.id);
          return <div className="addon-service-item" key={service.id}>
            <label className="booking-checkbox"><input type="checkbox" checked={Boolean(selected)} disabled={!selected && (service.isActive === false || service.unitPrice === null || service.unitPrice <= 0)} onChange={event => onChange(event.target.checked ? [...selections, { serviceId: service.id, quantity: 1, ...(isRental ? { serviceStartDate: startDate, serviceEndDate: endDate } : {}) }] : selections.filter(item => item.serviceId !== service.id))} /><span><strong>{service.name}</strong><small>{service.unitPrice === null ? 'Cần xác nhận báo giá' : `${new Intl.NumberFormat('vi-VN').format(service.unitPrice)} VND / ${service.billingUnit === 'DAY' ? 'ngày' : service.billingUnit === 'MONTH' ? 'tháng' : 'lần mua'}`}</small>{service.description && <small>{service.description}</small>}</span></label>
            {selected && <div className="checkout-fields">
              <label className="field-label">Số lượng {service.name}<input type="number" min={1} max={100} step={1} required value={selected.quantity} onChange={event => change(service.id, { quantity: Number(event.target.value) })} /></label>
              {isRental && <><label className="field-label">Ngày bắt đầu {service.name}<input type="date" required min={startDate} max={endDate} value={selected.serviceStartDate ?? ''} onChange={event => change(service.id, { serviceStartDate: event.target.value })} /></label><label className="field-label">Ngày kết thúc {service.name}<input type="date" required min={selected.serviceStartDate || startDate} max={endDate} value={selected.serviceEndDate ?? ''} onChange={event => change(service.id, { serviceEndDate: event.target.value })} /></label></>}
              <p className="field-help">{serviceBillingBasis(service, selected)}</p>
              <p role={issue ? 'alert' : 'status'}>{issue || (state?.key === key && state.error ? state.error : inventory ? inventory.available ? 'Dịch vụ còn đáp ứng; kiểm tra này chưa giữ hàng.' : 'Dịch vụ không đủ tồn kho hoặc công suất.' : 'Đang kiểm tra dịch vụ…')}</p>
            </div>}
          </div>;
        })}</div> : <div className="addon-service-empty">Chưa có dịch vụ thuộc nhóm này.</div>}
      </section>
    </div>
  </div>;
}

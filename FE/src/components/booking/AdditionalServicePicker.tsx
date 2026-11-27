import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../services/api';
import type { AdditionalService, ServiceInventory, ServiceSelection } from '../../types/additional-service';
import { defaultServiceSelection, maxServiceMonths, serviceCalendarMonths, serviceEstimatedTotal, serviceMonthEnd, serviceSelectionIssue } from '../../utils/service-period';
import { localizeService, serviceRateUnit } from '../../utils/service-labels';

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
      const service=services.find(item=>item.id===selection.serviceId);
      const query = new URLSearchParams({ quantity: String(selection.quantity),...(service?.facilityId?{facilityId:service.facilityId}:{}) });
      if (selection.serviceStartDate) query.set('startDate', selection.serviceStartDate);
      if (selection.serviceEndDate) query.set('endDate', selection.serviceEndDate);
      return apiRequest<ServiceInventory>(`/additional-services/${encodeURIComponent(selection.serviceId)}/availability?${query}`, { signal: controller.signal, authenticated: false });
    })).then(items => { if (!controller.signal.aborted) setState({ key, items, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, items: [], error: error instanceof Error ? error.message : 'Không kiểm tra được dịch vụ.' }); });
    return () => controller.abort();
  }, [key, validSelections, services]);
  const change = (serviceId: string, patch: Partial<ServiceSelection>) => onChange(selections.map(item => item.serviceId === serviceId ? { ...item, ...patch } : item));
  const removedSelections = selections.filter(selection => !services.some(service => service.id === selection.serviceId));
  if (!services.length) return <div className="addon-empty">Chưa có dịch vụ bổ sung được NestBox duyệt{selections.length > 0 && <button type="button" className="button-secondary" onClick={() => onChange([])}>Xóa dịch vụ không còn trong danh mục</button>}</div>;
  const groups = [
    { kind: 'DAY', title: 'Theo ngày' },
    { kind: 'MONTH', title: 'Theo tháng' },
    { kind: 'ONE_TIME', title: 'Mua một lần' },
  ] as const;
  const serviceGroups = groups.map(group => ({ ...group, services: services.filter(service => serviceGroup(service) === group.kind) }));
  const activeGroup = serviceGroups.find(group => group.kind === activeKind && group.services.length) ?? serviceGroups.find(group => group.services.length) ?? serviceGroups[0];
  return <div className="addon-service-picker">
    <div className="addon-service-tabs" role="group" aria-label="Loại dịch vụ bổ sung">
      {serviceGroups.filter(group => group.services.length > 0).map(group => <button type="button" className={group.kind === activeGroup.kind ? 'addon-service-tab is-selected' : 'addon-service-tab'} aria-pressed={group.kind === activeGroup.kind} aria-controls={`addon-service-panel-${group.kind.toLowerCase()}`} key={group.kind} onClick={() => setActiveKind(group.kind)}>
        {group.title}
      </button>)}
    </div>
    {selections.some(selection => issues.get(selection.serviceId)) && <p className="booking-alert" role="alert">Có dịch vụ chưa hợp lệ: {selections.filter(selection => issues.get(selection.serviceId)).map(selection => `${services.find(service => service.id === selection.serviceId)?.name ?? 'Dịch vụ đã chọn'}: ${issues.get(selection.serviceId)}`).join(' ')}</p>}
    {removedSelections.length > 0 && <button type="button" className="button-secondary" onClick={() => onChange(selections.filter(selection => services.some(service => service.id === selection.serviceId)))}>Xóa dịch vụ không còn trong danh mục</button>}
    <div className="addon-service-scroll" key={activeGroup.kind}>
      <section className="addon-service-group" id={`addon-service-panel-${activeGroup.kind.toLowerCase()}`}>
        {activeGroup.services.length ? <div className="addon-service-items">{activeGroup.services.map(service => {
          const selected = selections.find(item => item.serviceId === service.id);
          const inventory = state?.key === key ? state.items.find(item => item.serviceId === service.id) : undefined;
          const isRental = service.kind === 'RENTAL';
          const issue = issues.get(service.id);
          const suggested = defaultServiceSelection(service, startDate, endDate);
          const monthly = service.billingUnit === 'MONTH';
          const minimum = service.minimumRentalMonths ?? 1;
          const from = selected?.serviceStartDate || startDate;
          const maximum = maxServiceMonths(from, endDate);
          const estimate = selected ? serviceEstimatedTotal(service, selected, startDate, endDate) : null;
          return <div className="addon-service-item" key={service.id}>
            <label className="booking-checkbox"><input aria-label={service.name} type="checkbox" checked={Boolean(selected)} disabled={!selected && (!suggested || service.isActive === false || service.unitPrice === null || service.unitPrice <= 0)} onChange={event => onChange(event.target.checked && suggested ? [...selections, suggested] : selections.filter(item => item.serviceId !== service.id))} /><span><strong>{service.name}</strong><small>{service.unitPrice === null ? 'Cần xác nhận báo giá' : `${new Intl.NumberFormat('vi-VN').format(service.unitPrice)} đ / ${serviceRateUnit(service)}`}</small>{!suggested && isRental && <small>Chọn thời gian thuê phù hợp để thuê thiết bị.</small>}</span></label>
            {monthly && <small>Tối thiểu {minimum} tháng. {suggested ? `Mặc định ${serviceCalendarMonths(startDate, suggested.serviceEndDate ?? '')} tháng theo kỳ thuê kho.` : 'Kỳ thuê kho ngắn hơn mức tối thiểu.'}</small>}
            {selected && <div className="checkout-fields">
              <label className="field-label">Số lượng {service.name}<input type="number" min={1} max={100} step={1} required value={selected.quantity} onChange={event => change(service.id, { quantity: Number(event.target.value) })} /></label>
              {monthly ? <label className="field-label">Số tháng sử dụng {service.name}<input type="number" min={minimum} max={maximum} step={1}
                value={serviceCalendarMonths(from, selected.serviceEndDate ?? '') ?? ''} readOnly={maximum === minimum}
                onChange={event => change(service.id, { serviceEndDate: serviceMonthEnd(from, Number(event.target.value)) })} />
                {maximum === minimum && <small>Kỳ thuê kho chỉ đủ cho mức tối thiểu.</small>}</label>
                : isRental && <><label className="field-label">Ngày bắt đầu {service.name}<input type="date" required min={startDate} max={endDate} value={selected.serviceStartDate ?? ''} onChange={event => change(service.id, { serviceStartDate: event.target.value })} /></label><label className="field-label">Ngày trả {service.name}<input type="date" required min={selected.serviceStartDate || startDate} max={endDate} value={selected.serviceEndDate ?? ''} onChange={event => change(service.id, { serviceEndDate: event.target.value })} /></label></>}
              {estimate !== null && <p>Tạm tính <strong>{estimate.toLocaleString('vi-VN')} ₫</strong></p>}
              {!issue && typeof inventory?.availableQuantity === 'number' && <p>Còn {inventory.availableQuantity} {service.physicalUnit || 'thiết bị'} trong kỳ đã chọn.</p>}
              {isRental && suggested && <button type="button" className="portal-text-button" onClick={() => change(service.id, { serviceStartDate: suggested.serviceStartDate, serviceEndDate: suggested.serviceEndDate })}>Đặt lại kỳ sử dụng theo kho</button>}
              {issue && <p role="alert">{issue}</p>}
              {!issue && state?.key === key && state.error && <p role="status">Chưa kiểm tra được dịch vụ.</p>}
              {!issue && inventory?.available === false && <p role="alert">Dịch vụ không đủ số lượng.</p>}
            </div>}
          </div>;
        })}</div> : <div className="addon-service-empty">Chưa có dịch vụ thuộc nhóm này.</div>}
      </section>
    </div>
  </div>;
}

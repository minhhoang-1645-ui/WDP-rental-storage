import { useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';
import type { AdditionalService, ServiceInventory, ServiceSelection } from '../../types/additional-service';

export function AdditionalServicePicker({ services, selections, startDate, endDate, onChange }: {
  services: AdditionalService[];
  selections: ServiceSelection[];
  startDate: string;
  endDate: string;
  onChange: (value: ServiceSelection[]) => void;
}) {
  const [state, setState] = useState<{ key: string; error: string; items: ServiceInventory[] }>();
  const key = JSON.stringify(selections);
  useEffect(() => {
    if (!selections.length) return;
    const controller = new AbortController();
    Promise.all(selections.map(selection => {
      const query = new URLSearchParams({ quantity: String(selection.quantity) });
      if (selection.serviceStartDate) query.set('startDate', selection.serviceStartDate);
      if (selection.serviceEndDate) query.set('endDate', selection.serviceEndDate);
      return apiRequest<ServiceInventory>(`/additional-services/${encodeURIComponent(selection.serviceId)}/availability?${query}`, { signal: controller.signal, authenticated: false });
    })).then(items => { if (!controller.signal.aborted) setState({ key, items, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, items: [], error: error instanceof Error ? error.message : 'Không kiểm tra được dịch vụ.' }); });
    return () => controller.abort();
  }, [key, selections]);
  const change = (serviceId: string, patch: Partial<ServiceSelection>) => onChange(selections.map(item => item.serviceId === serviceId ? { ...item, ...patch } : item));
  if (!services.length) return <div className="addon-empty">Chưa có dịch vụ bổ sung được WDP duyệt</div>;
  return <div>{services.map(service => {
    const selected = selections.find(item => item.serviceId === service.id);
    const inventory = state?.key === key ? state.items.find(item => item.serviceId === service.id) : undefined;
    return <div className="booking-option-block" key={service.id}>
      <label className="booking-checkbox"><input type="checkbox" checked={Boolean(selected)} disabled={service.unitPrice === null || service.unitPrice <= 0} onChange={event => onChange(event.target.checked ? [...selections, { serviceId: service.id, quantity: 1, ...(service.kind === 'RENTAL' ? { serviceStartDate: startDate, serviceEndDate: endDate } : {}) }] : selections.filter(item => item.serviceId !== service.id))} /><span><strong>{service.name}</strong><small>{service.unitPrice === null ? 'Cần xác nhận báo giá' : `${new Intl.NumberFormat('vi-VN').format(service.unitPrice)} VND / ${service.billingUnit === 'DAY' ? 'ngày' : service.billingUnit === 'MONTH' ? 'tháng' : 'lần mua'}`}</small>{service.description && <small>{service.description}</small>}</span></label>
      {selected && <div className="checkout-fields">
        <label className="field-label">Số lượng {service.name}<input type="number" min={1} max={100} step={1} required value={selected.quantity} onChange={event => change(service.id, { quantity: Number(event.target.value) })} /></label>
        {service.kind === 'RENTAL' && <><label className="field-label">Ngày bắt đầu {service.name}<input type="date" required min={startDate} max={endDate} value={selected.serviceStartDate ?? ''} onChange={event => change(service.id, { serviceStartDate: event.target.value })} /></label><label className="field-label">Ngày kết thúc {service.name}<input type="date" required min={selected.serviceStartDate || startDate} max={endDate} value={selected.serviceEndDate ?? ''} onChange={event => change(service.id, { serviceEndDate: event.target.value })} /></label></>}
        <p role="status">{state?.key === key && state.error ? state.error : inventory ? inventory.available ? 'Dịch vụ còn đáp ứng; kiểm tra này chưa giữ hàng.' : 'Dịch vụ không đủ tồn kho hoặc công suất.' : 'Đang kiểm tra dịch vụ…'}</p>
      </div>}
    </div>;
  })}</div>;
}

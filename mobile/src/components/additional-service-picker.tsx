import { Text, View } from 'react-native';
import { Button, Field, styles, money } from '@/operations/ui';
import { ErrorState, LoadingState } from './screen-state';
import type { AdditionalService, ServiceSelection } from '@/types/additional-service';
import { defaultServiceSelection, serviceBillingBasis, serviceEstimatedTotal, serviceSelectionIssue } from '@/utils/service-period';
import { localizeService } from '@/utils/service-labels';

export function AdditionalServicePicker({ services, selections, start, end, loading, error, retry, onChange }: { services: AdditionalService[]; selections: ServiceSelection[]; start: string; end: string; loading: boolean; error?: string; retry: () => void; onChange: (value: ServiceSelection[]) => void }) {
  const change = (id: string, patch: Partial<ServiceSelection>) => onChange(selections.map(item => item.serviceId === id ? { ...item, ...patch } : item));
  return <View style={{ gap: 12 }}><Text style={styles.title}>Dịch vụ bổ sung (không bắt buộc)</Text>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={retry} /> : !services.length ? <Text style={styles.copy}>Chưa có dịch vụ đang được cung cấp.</Text> : services.map(rawService => {
      const service = localizeService(rawService);
      const selection = selections.find(item => item.serviceId === service.id);
      const issue = selection ? serviceSelectionIssue(service, selection, start, end) : '';
      const defaults = defaultServiceSelection(service, start, end);
      const subtotal = selection ? serviceEstimatedTotal(service, selection, start, end) : null;
      return <View key={service.id} style={styles.card}>
        <Text style={styles.title}>{service.name}</Text><Text style={styles.copy}>{money(service.unitPrice)} / {service.billingUnit === 'ONE_TIME' ? 'lần mua' : service.billingUnit === 'DAY' ? 'ngày' : 'tháng lịch'}{service.description ? ` · ${service.description}` : ''}</Text>
        <Button title={selection ? `Bỏ chọn ${service.name}` : `Thêm ${service.name}`} variant="secondary" disabled={!selection && (!defaults || service.isActive === false || !Number.isSafeInteger(service.unitPrice) || Number(service.unitPrice) <= 0)} onPress={() => onChange(selection ? selections.filter(item => item.serviceId !== service.id) : defaults ? [...selections, defaults] : selections)} />
        {!defaults && service.kind === 'RENTAL' && <Text style={styles.copy}>Kỳ thuê kho chưa đủ thời gian sử dụng thiết bị này. Thiết bị theo tháng cần đủ tháng lịch.</Text>}
        {subtotal !== null && <Text style={styles.title}>Tạm tính: {money(subtotal)}</Text>}
        {selection && <><Field title={`Số lượng ${service.name}`} numeric value={String(selection.quantity)} onChange={value => change(service.id, { quantity: Number(value) })} maxLength={3} />{service.kind === 'RENTAL' && <><Field title={`Ngày bắt đầu ${service.name} (YYYY-MM-DD)`} value={selection.serviceStartDate ?? ''} maxLength={10} onChange={value => change(service.id, { serviceStartDate: value })} /><Field title={`Ngày kết thúc ${service.name} (YYYY-MM-DD)`} value={selection.serviceEndDate ?? ''} maxLength={10} onChange={value => change(service.id, { serviceEndDate: value })} /></>}<Text style={issue ? styles.error : styles.copy}>{issue || serviceBillingBasis(service, selection)}</Text></>}
      </View>;
    })}
  </View>;
}

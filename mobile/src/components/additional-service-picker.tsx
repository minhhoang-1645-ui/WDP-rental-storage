import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Disclosure, Field, styles, money } from '@/operations/ui';
import { DateField } from './date-field';
import { ErrorState, LoadingState } from './screen-state';
import type { AdditionalService, ServiceSelection } from '@/types/additional-service';
import { defaultServiceSelection, serviceBillingBasis, serviceEstimatedTotal, serviceSelectionIssue } from '@/utils/service-period';
import { localizeService, serviceRateUnit } from '@/utils/service-labels';

export function AdditionalServicePicker({ services, selections, start, end, loading, error, retry, onChange }: { services: AdditionalService[]; selections: ServiceSelection[]; start: string; end: string; loading: boolean; error?: string; retry: () => void; onChange: (value: ServiceSelection[]) => void }) {
  const [kind, setKind] = useState<'RENTAL' | 'PURCHASE'>('RENTAL');
  const change = (id: string, patch: Partial<ServiceSelection>) => onChange(selections.map(item => item.serviceId === id ? { ...item, ...patch } : item));
  const visible = services.filter(service => service.kind === kind);
  return <Disclosure title="Dịch vụ thêm (tùy chọn)">
    {selections.length > 0 && <Text style={styles.copy}>Đã chọn {selections.length} dịch vụ</Text>}
    <View style={styles.row}><Button title="Thuê thiết bị" variant={kind === 'RENTAL' ? 'primary' : 'secondary'} onPress={() => setKind('RENTAL')} /><Button title="Mua một lần" variant={kind === 'PURCHASE' ? 'primary' : 'secondary'} onPress={() => setKind('PURCHASE')} /></View>
    {loading ? <LoadingState layout="compact" /> : error ? <ErrorState message={error} onRetry={retry} /> : !visible.length ? <Text style={styles.copy}>Chưa có dịch vụ trong nhóm này.</Text> : visible.map(rawService => {
      const service = localizeService(rawService);
      const selection = selections.find(item => item.serviceId === service.id);
      const issue = selection ? serviceSelectionIssue(service, selection, start, end) : '';
      const defaults = defaultServiceSelection(service, start, end);
      const subtotal = selection ? serviceEstimatedTotal(service, selection, start, end) : null;
      return <View key={service.id} style={styles.card}>
        <Text style={styles.title}>{service.name}</Text><Text style={styles.copy}>{money(service.unitPrice)} / {serviceRateUnit(service)}</Text>
        <Button title={selection ? 'Bỏ chọn' : 'Thêm dịch vụ'} variant="secondary" disabled={!selection && (!defaults || service.isActive === false || !Number.isSafeInteger(service.unitPrice) || Number(service.unitPrice) <= 0)} onPress={() => onChange(selection ? selections.filter(item => item.serviceId !== service.id) : defaults ? [...selections, defaults] : selections)} />
        {!defaults && service.kind === 'RENTAL' && <Text style={styles.copy}>Kỳ thuê kho chưa đủ thời gian sử dụng thiết bị này. Thiết bị theo tháng cần đủ tháng lịch.</Text>}
        {subtotal !== null && <Text style={styles.title}>Tạm tính: {money(subtotal)}</Text>}
        {selection && <><Field title="Số lượng" numeric value={String(selection.quantity)} onChange={value => change(service.id, { quantity: Number(value) })} maxLength={3} />{service.kind === 'RENTAL' && <><DateField title="Dùng từ ngày" min={start} value={selection.serviceStartDate ?? ''} onChange={value => change(service.id, { serviceStartDate: value })} /><DateField title="Đến ngày" min={selection.serviceStartDate || start} value={selection.serviceEndDate ?? ''} onChange={value => change(service.id, { serviceEndDate: value })} /></>}{issue ? <Text style={styles.error}>{issue}</Text> : <Disclosure title="Cách tính phí"><Text style={styles.copy}>{serviceBillingBasis(service, selection)}</Text></Disclosure>}</>}
      </View>;
    })}
  </Disclosure>;
}

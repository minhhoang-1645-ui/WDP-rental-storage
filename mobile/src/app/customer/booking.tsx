import { AdditionalServicePicker } from '@/components/additional-service-picker';
import type { AdditionalService, ServiceInventory, ServiceSelection } from '@/types/additional-service';
import { serviceSelectionIssue } from '@/utils/service-period';
import { useResource } from '@/operations/use-resource';
import { useDraftGuard } from '@/services/live-events';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { PriceBreakdown } from '@/components/price-breakdown';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import { object, rows, text, type Row } from '@/operations/model';
import { Button, Field, Panel, styles } from '@/operations/ui';
import { usePublicCatalog } from '@/hooks/use-public-catalog';
import { apiRequest } from '@/services/api';
import { validDate } from '@/operations/availability';

type Draft = { productId: string; startDate: string; quantity: string; periodMode: 'duration' | 'dates'; durationMonths: string; endDate: string; paymentPlan: 'PAY_MONTHLY' | 'PREPAID'; adjacencyPreference: boolean };
const initial = (productId = ''): Draft => ({ productId, startDate: '', quantity: '1', periodMode: 'duration', durationMonths: '3', endDate: '', paymentPlan: 'PAY_MONTHLY', adjacencyPreference: false });

export default function BookingScreen() {
  const params = useLocalSearchParams<{ product?: string }>();
  const catalog = usePublicCatalog();
  const [draft, setDraft] = useState(() => initial(params.product));
  const [step, setStep] = useState(1);
  const addons = useResource<AdditionalService[]>('/additional-services');
  const [selections, setSelections] = useState<ServiceSelection[]>([]);
  useDraftGuard(Boolean(draft.startDate || selections.length));
  const [availability, setAvailability] = useState<Row>();
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const products = rows(catalog.data?.products);
  const productId = draft.productId || text(products[0] ?? {}, 'id');
  const selected = useMemo(() => products.find(product => text(product, 'id') === productId), [productId, products]);
  const update = (next: Partial<Draft>) => { setAvailability(undefined); setError(''); setDraft(value => ({ ...value, ...next })); };
  const rentalEnd = (() => {
    if (draft.periodMode === 'dates') return draft.endDate;
    if (!validDate(draft.startDate) || ![1, 3, 6, 12].includes(Number(draft.durationMonths))) return '';
    const date = new Date(draft.startDate + 'T00:00:00Z');
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Number(draft.durationMonths), 1));
    end.setUTCDate(Math.min(date.getUTCDate(), new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()));
    return end.toISOString().slice(0, 10);
  })();
  const body = () => ({ productId, startDate: draft.startDate, quantity: Number(draft.quantity), periodMode: draft.periodMode, ...(draft.periodMode === 'duration' ? { durationMonths: Number(draft.durationMonths) } : { endDate: draft.endDate }), paymentPlan: draft.paymentPlan, paymentChoice: 'pay-later', adjacencyPreference: draft.adjacencyPreference, addonIds: [], services: selections });
  const issue = () => !selected ? 'Chọn loại kho đang được cung cấp.' : !validDate(draft.startDate) ? 'Nhập ngày bắt đầu theo YYYY-MM-DD.' : !Number.isInteger(Number(draft.quantity)) || Number(draft.quantity) < 1 || Number(draft.quantity) > 3 ? 'Số lượng kho phải từ 1 đến 3.' : draft.periodMode === 'duration' && ![1, 3, 6, 12].includes(Number(draft.durationMonths)) ? 'Chọn kỳ thuê được hỗ trợ.' : draft.periodMode === 'dates' && (!validDate(draft.endDate) || draft.endDate <= draft.startDate) ? 'Ngày kết thúc phải sau ngày bắt đầu.' : '';
  const check = async () => {
    const invalid = issue() || selections.map(selection => serviceSelectionIssue(addons.data?.find(service => service.id === selection.serviceId), selection, draft.startDate, rentalEnd)).find(Boolean); if (invalid) { setError(invalid); return; }
    setChecking(true); setError('');
    try {
      for (const selection of selections) {
        const query = new URLSearchParams({ quantity: String(selection.quantity), ...(selection.serviceStartDate ? { startDate: selection.serviceStartDate } : {}), ...(selection.serviceEndDate ? { endDate: selection.serviceEndDate } : {}) });
        const stock = await apiRequest<ServiceInventory>('/additional-services/' + encodeURIComponent(selection.serviceId) + '/availability?' + query);
        if (!stock.available) throw new Error('Dịch vụ đã chọn không đủ tồn kho/công suất. Vui lòng giảm số lượng hoặc đổi thời gian.');
      }
      const result = await apiRequest<Row>('/booking/availability', { method: 'POST', authenticated: false, body: JSON.stringify(body()) }); setAvailability(result); setStep(3); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa kiểm tra được khả dụng.'); }
    finally { setChecking(false); }
  };
  const submit = async () => {
    if (lock.current || availability?.available !== true) return;
    lock.current = true; setSubmitting(true); setError('');
    try {
      const payload = JSON.stringify(body());
      // The reservation endpoint deduplicates the normalized booking payload on the server.
      const created = await apiRequest<Row>('/reservations', { method: 'POST', body: payload }); router.replace(`/customer/reservations/${encodeURIComponent(text(created, 'id', 'reference'))}`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không tạo được yêu cầu đặt kho.'); }
    finally { lock.current = false; setSubmitting(false); }
  };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <PageHeader eyebrow={`Đặt kho · Bước ${step}/3`} title="Gửi yêu cầu đặt kho" description="Chọn loại kho, thời gian và dịch vụ. Khi đặt thành công, hệ thống giữ kho theo hạn ghi trên đơn; bạn cần ký hợp đồng và thanh toán để tiếp tục." />
    {catalog.loading && !catalog.data ? <LoadingState label="Đang tải catalog…" /> : catalog.error ? <ErrorState message={catalog.error} onRetry={catalog.refresh} /> : <>
      <Progress step={step} />
      {step === 1 && <Panel title="1. Chọn loại kho"><Text style={styles.copy}>{selected ? `${text(selected, 'name')} · ${text(selected, 'code')}` : 'Chưa chọn loại kho'}</Text>{products.map(product => <Button key={text(product, 'id')} title={`${productId === text(product, 'id') ? '✓ ' : ''}${text(product, 'name')} · ${text(product, 'code')}`} variant={productId === text(product, 'id') ? 'primary' : 'secondary'} onPress={() => update({ productId: text(product, 'id') })} />)}<Field title="Ngày bắt đầu (YYYY-MM-DD)" value={draft.startDate} onChange={value => update({ startDate: value })} maxLength={10} /><Field title="Số kho" value={draft.quantity} onChange={value => update({ quantity: value.replace(/\D/g, '') })} numeric maxLength={1} /><Button title="Tiếp tục" onPress={() => { const invalid = issue(); if (invalid) setError(invalid); else setStep(2); }} /></Panel>}
      {step === 2 && <Panel title="2. Kỳ thuê và thanh toán"><Button title={draft.periodMode === 'duration' ? 'Theo số tháng ✓' : 'Theo số tháng'} variant={draft.periodMode === 'duration' ? 'primary' : 'secondary'} onPress={() => update({ periodMode: 'duration' })} /><Button title={draft.periodMode === 'dates' ? 'Theo ngày kết thúc ✓' : 'Theo ngày kết thúc'} variant={draft.periodMode === 'dates' ? 'primary' : 'secondary'} onPress={() => update({ periodMode: 'dates' })} />{draft.periodMode === 'duration' ? <Field title="Số tháng (1, 3, 6 hoặc 12)" value={draft.durationMonths} onChange={value => update({ durationMonths: value.replace(/\D/g, '') })} numeric maxLength={2} /> : <Field title="Ngày kết thúc (YYYY-MM-DD)" value={draft.endDate} onChange={value => update({ endDate: value })} maxLength={10} />}<Button title={draft.paymentPlan === 'PAY_MONTHLY' ? 'Trả hàng tháng ✓' : 'Trả hàng tháng'} variant={draft.paymentPlan === 'PAY_MONTHLY' ? 'primary' : 'secondary'} onPress={() => update({ paymentPlan: 'PAY_MONTHLY' })} /><Button title={draft.paymentPlan === 'PREPAID' ? 'Trả trước ✓' : 'Trả trước'} variant={draft.paymentPlan === 'PREPAID' ? 'primary' : 'secondary'} onPress={() => update({ paymentPlan: 'PREPAID' })} /><AdditionalServicePicker services={addons.data ?? []} selections={selections} start={draft.startDate} end={rentalEnd} loading={addons.loading} error={addons.error} retry={addons.refresh} onChange={value => { setSelections(value); setAvailability(undefined); setError(''); }} /><Button title={checking ? 'Đang kiểm tra…' : 'Kiểm tra khả dụng & báo giá'} onPress={() => void check()} disabled={checking} /><Button title="Quay lại" variant="secondary" onPress={() => setStep(1)} /></Panel>}
      {step === 3 && <Panel title="3. Xác nhận yêu cầu">{availability?.available === true ? <Text style={local.good}>Còn kho phù hợp cho toàn bộ thời hạn. Kết quả này chưa giữ kho; NestBox sẽ kiểm tra lại khi tạo yêu cầu.</Text> : <Text style={local.bad}>{text(availability ?? {}, 'message') || 'Chưa có kho phù hợp cho khoảng thời gian này.'}</Text>}<PriceBreakdown quote={object(availability?.quote)} />{availability?.available === true && <Button title={submitting ? 'Đang gửi yêu cầu…' : 'Gửi yêu cầu đặt kho'} onPress={() => void submit()} disabled={submitting} />}<Button title="Sửa thời gian thuê" variant="secondary" onPress={() => setStep(2)} /></Panel>}
      {error ? <Text accessibilityRole="alert" selectable style={styles.error}>{error}</Text> : null}
    </>}
  </ScrollView>;
}

function Progress({ step }: { step: number }) { return <View style={local.progress}>{['Loại kho', 'Thời gian', 'Xác nhận'].map((item, index) => <View key={item} style={local.progressItem}><View style={[local.dot, index + 1 <= step && local.dotActive]}><Text style={[local.dotText, index + 1 <= step && local.dotTextActive]}>{index + 1}</Text></View><Text style={local.progressText}>{item}</Text></View>)}</View>; }

const local = StyleSheet.create({
  progress: { flexDirection: 'row', justifyContent: 'space-between' }, progressItem: { alignItems: 'center', flex: 1, gap: WdpSpacing.xxs }, dot: { alignItems: 'center', backgroundColor: WdpColors.surfaceSecondary, borderRadius: WdpRadius.full, height: 28, justifyContent: 'center', width: 28 }, dotActive: { backgroundColor: WdpColors.teal }, dotText: { color: WdpColors.muted, fontSize: 12, fontWeight: '700' }, dotTextActive: { color: WdpColors.surface }, progressText: { color: WdpColors.muted, fontSize: 12, textAlign: 'center' }, good: { color: WdpColors.success, fontSize: 14, lineHeight: 21 }, bad: { color: WdpColors.danger, fontSize: 14, lineHeight: 21 },
});

import { AdditionalServicePicker } from '@/components/additional-service-picker';
import type { AdditionalService, ServiceInventory, ServiceSelection } from '@/types/additional-service';
import { serviceSelectionIssue } from '@/utils/service-period';
import { useResource } from '@/operations/use-resource';
import { useDraftGuard } from '@/services/live-events';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Warehouse, CalendarDays, Check } from 'lucide-react-native';

import { PriceBreakdown } from '@/components/price-breakdown';
import { DateField } from '@/components/date-field';
import { FloorPlanViewer, type FloorPlanUnit } from '@/components/floor-plan-viewer';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import { object, rows, text, type Row } from '@/operations/model';
import { Button, Field, Panel, styles } from '@/operations/ui';
import { usePublicCatalog } from '@/hooks/use-public-catalog';
import { apiRequest } from '@/services/api';
import { validDate } from '@/operations/availability';
import { rentalEndDate } from '@/utils/rental-period';

type Draft = { productId: string; startDate: string; quantity: string; periodMode: 'duration' | 'dates'; durationMonths: string; endDate: string; paymentPlan: 'PAY_MONTHLY' | 'PREPAID'; adjacencyPreference: boolean; selectedUnitIds: string[] };
type UnitMap = { productId: string; startDate: string; endDateExclusive: string; units: FloorPlanUnit[] };
const initial = (productId = ''): Draft => ({ productId, startDate: '', quantity: '1', periodMode: 'duration', durationMonths: '3', endDate: '', paymentPlan: 'PAY_MONTHLY', adjacencyPreference: false, selectedUnitIds: [] });

export default function BookingScreen() {
  const params = useLocalSearchParams<{ product?: string; startDate?: string; endDate?: string; unit?: string; unitCode?: string; periodMode?: string; durationMonths?: string }>();
  const fromMap = Boolean(params.product && params.unit);
  const catalog = usePublicCatalog();
  const [draft, setDraft] = useState(() => ({ ...initial(params.product), ...(params.startDate && params.endDate ? { startDate: params.startDate, endDate: params.endDate, periodMode: 'dates' as const } : {}), ...(params.periodMode === 'duration' && ['1', '3', '6', '12'].includes(params.durationMonths ?? '') ? { periodMode: 'duration' as const, durationMonths: params.durationMonths! } : {}), selectedUnitIds: params.unit ? [params.unit] : [] }));
  const [step, setStep] = useState(fromMap ? 2 : 1);
  const [showMap, setShowMap] = useState(false);
  const addons = useResource<AdditionalService[]>('/additional-services');
  const [selections, setSelections] = useState<ServiceSelection[]>([]);
  useDraftGuard(Boolean(draft.startDate || selections.length));
  const [availability, setAvailability] = useState<Row>();
  const [unitMap, setUnitMap] = useState<UnitMap>();
  const [mapFloor, setMapFloor] = useState('');
  const [mapZone, setMapZone] = useState('');
  const [mapView, setMapView] = useState<'map' | 'list'>('map');
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const products = rows(catalog.data?.products);
  const productId = draft.productId || text(products[0] ?? {}, 'id');
  const selected = useMemo(() => products.find(product => text(product, 'id') === productId), [productId, products]);
  const update = (next: Partial<Draft>) => { setAvailability(undefined); setUnitMap(undefined); setError(''); setDraft(value => ({ ...value, ...next, ...(next.selectedUnitIds === undefined && (next.productId !== undefined || next.quantity !== undefined) ? { selectedUnitIds: [] } : {}) })); };
  const rentalEnd = (() => {
    if (draft.periodMode === 'dates') return draft.endDate;
    return rentalEndDate(draft.startDate, Number(draft.durationMonths));
  })();
  const body = () => ({ productId, startDate: draft.startDate, quantity: Number(draft.quantity), periodMode: draft.periodMode, ...(draft.periodMode === 'duration' ? { durationMonths: Number(draft.durationMonths) } : { endDate: draft.endDate }), paymentPlan: draft.paymentPlan, paymentChoice: 'pay-later', adjacencyPreference: draft.adjacencyPreference, ...(draft.selectedUnitIds.length ? { selectedUnitIds: draft.selectedUnitIds } : {}), addonIds: [], services: selections });
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
      const request = body();
      const requestJson = JSON.stringify(request);
      const result = await apiRequest<Row>('/booking/availability', { method: 'POST', authenticated: false, body: requestJson });
      setAvailability(result);
      const map = result.available === true ? await apiRequest<UnitMap>('/booking/unit-map', { method: 'POST', authenticated: false, body: requestJson }) : undefined;
      setUnitMap(map);
      if (draft.selectedUnitIds.some(id => !map?.units.some(unit => unit.id === id && unit.available))) {
        setError('Kho đã chọn không còn trống trong kỳ này. Hãy đổi kho hoặc thời gian.');
        return;
      }
      const first = map?.units[0];
      setMapFloor(first?.floor ?? '');
      setMapZone(first?.zone ?? '');
      setStep(3); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa kiểm tra được khả dụng.'); }
    finally { setChecking(false); }
  };
  const submit = async () => {
    if (lock.current || availability?.available !== true) return;
    if (draft.selectedUnitIds.length && draft.selectedUnitIds.length !== Number(draft.quantity)) { setError(`Vui lòng chọn đủ ${draft.quantity} kho hoặc bỏ chọn để hệ thống tự phân bổ.`); return; }
    lock.current = true; setSubmitting(true); setError('');
    try {
      const payload = JSON.stringify(body());
      // The reservation endpoint deduplicates the normalized booking payload on the server.
      const created = await apiRequest<Row>('/reservations', { method: 'POST', body: payload }); router.replace(`/customer/reservations/${encodeURIComponent(text(created, 'id', 'reference'))}`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không tạo được yêu cầu đặt kho.'); }
    finally { lock.current = false; setSubmitting(false); }
  };
  const floors = [...new Set((unitMap?.units ?? []).map(unit => unit.floor ?? ''))];
  const zones = [...new Set((unitMap?.units ?? []).filter(unit => (unit.floor ?? '') === mapFloor).map(unit => unit.zone ?? ''))];
  const visibleUnits = (unitMap?.units ?? []).filter(unit => (unit.floor ?? '') === mapFloor && (unit.zone ?? '') === mapZone);
  const toggleUnit = (unit: FloorPlanUnit) => { if (!unit.available) return; setError(''); setDraft(value => ({ ...value, selectedUnitIds: value.selectedUnitIds.includes(unit.id) ? value.selectedUnitIds.filter(id => id !== unit.id) : value.selectedUnitIds.length < Number(value.quantity) ? [...value.selectedUnitIds, unit.id] : value.selectedUnitIds })); };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Đặt kho" title={step === 3 ? "Xác nhận đặt kho" : "Hoàn tất đặt kho"} description="Kiểm tra thông tin, ký hợp đồng và thanh toán." />
    {catalog.loading && !catalog.data ? <LoadingState label="Đang tải catalog…" /> : catalog.error ? <ErrorState message={catalog.error} onRetry={catalog.refresh} /> : <>
      <Progress step={step} fromMap={fromMap} />
      {fromMap && <Panel title="Kho đã chọn">
        <View style={local.summaryRow}><Warehouse size={24} color={WdpColors.navy} /><View style={{ flex: 1, gap: 4 }}>
          <Text style={local.mapTitle}>{params.unitCode || 'Kho đã chọn trên sơ đồ'}</Text>
          <Text style={styles.copy}>{text(selected ?? {}, 'name')} · {text(selected ?? {}, 'dimensions')}</Text>
        </View></View>
        <View style={local.summaryRow}><CalendarDays size={18} color={WdpColors.muted} /><Text style={styles.copy}>{draft.startDate} → {rentalEnd || 'Chọn ngày kết thúc'}</Text></View>
        <Button title="Đổi kho" variant="secondary" onPress={() => router.replace({ pathname: '/customer/discover', params: { size: text(selected ?? {}, 'sizeId') } })} />
      </Panel>}
      {step === 1 && !fromMap && <Panel title="Chọn loại kho"><Text style={styles.copy}>{selected ? `${text(selected, 'name')} · ${text(selected, 'code')}` : 'Chưa chọn loại kho'}</Text>{products.map(product => <Button key={text(product, 'id')} title={`${productId === text(product, 'id') ? '✓ ' : ''}${text(product, 'name')} · ${text(product, 'code')}`} variant={productId === text(product, 'id') ? 'primary' : 'secondary'} onPress={() => update({ productId: text(product, 'id') })} />)}<DateField title="Ngày bắt đầu" value={draft.startDate} onChange={value => update({ startDate: value })} /><Field title="Số kho" value={draft.quantity} onChange={value => update({ quantity: value.replace(/\D/g, '') })} numeric maxLength={1} /><Button title="Tiếp tục" onPress={() => { const invalid = issue(); if (invalid) setError(invalid); else setStep(2); }} /></Panel>}
      {step === 2 && <Panel title="Thời gian & thanh toán">{fromMap && <DateField title="Ngày bắt đầu" value={draft.startDate} onChange={value => update({ startDate: value })} />}<Button title={draft.periodMode === 'duration' ? 'Theo số tháng ✓' : 'Theo số tháng'} variant={draft.periodMode === 'duration' ? 'primary' : 'secondary'} onPress={() => update({ periodMode: 'duration' })} /><Button title={draft.periodMode === 'dates' ? 'Theo ngày kết thúc ✓' : 'Theo ngày kết thúc'} variant={draft.periodMode === 'dates' ? 'primary' : 'secondary'} onPress={() => update({ periodMode: 'dates' })} />{draft.periodMode === 'duration' ? <Field title="Số tháng (1, 3, 6 hoặc 12)" value={draft.durationMonths} onChange={value => update({ durationMonths: value.replace(/\D/g, '') })} numeric maxLength={2} /> : <DateField title="Ngày kết thúc" value={draft.endDate} onChange={value => update({ endDate: value })} />}<Button title={draft.paymentPlan === 'PAY_MONTHLY' ? 'Trả hàng tháng ✓' : 'Trả hàng tháng'} variant={draft.paymentPlan === 'PAY_MONTHLY' ? 'primary' : 'secondary'} onPress={() => update({ paymentPlan: 'PAY_MONTHLY' })} /><Button title={draft.paymentPlan === 'PREPAID' ? 'Trả trước ✓' : 'Trả trước'} variant={draft.paymentPlan === 'PREPAID' ? 'primary' : 'secondary'} onPress={() => update({ paymentPlan: 'PREPAID' })} /><AdditionalServicePicker services={addons.data ?? []} selections={selections} start={draft.startDate} end={rentalEnd} loading={addons.loading} error={addons.error} retry={addons.refresh} onChange={value => { setSelections(value); setAvailability(undefined); setError(''); }} /><Button title={checking ? 'Đang kiểm tra…' : 'Xem báo giá'} onPress={() => void check()} disabled={checking} />{!fromMap && <Button title="Quay lại" variant="secondary" onPress={() => setStep(1)} />}</Panel>}
      {step === 3 && <Panel title="Kiểm tra & xác nhận">{availability?.available === true ? <Text style={local.good}>Còn kho trong kỳ thuê đã chọn.</Text> : <Text style={local.bad}>{text(availability ?? {}, 'message') || 'Chưa có kho phù hợp cho khoảng thời gian này.'}</Text>}{unitMap && (!fromMap || showMap) ? <View style={local.mapSection}><Text style={local.mapTitle}>{fromMap ? "Vị trí kho đã chọn" : "Chọn kho cùng loại"}</Text>{!fromMap && <Text style={styles.copy}>Chọn {draft.quantity} kho, hoặc để hệ thống phân bổ.</Text>}<Text style={local.mapTitle}>Tầng</Text>{floors.map(floor => <Button key={floor || 'unassigned'} title={floor || 'Chưa xác định tầng'} variant={mapFloor === floor ? 'primary' : 'secondary'} onPress={() => { setMapFloor(floor); setMapZone(unitMap.units.find(unit => (unit.floor ?? '') === floor)?.zone ?? ''); }} />)}<Text style={local.mapTitle}>Khu vực</Text>{zones.map(zone => <Button key={zone || 'unassigned'} title={zone || 'Chưa xác định khu'} variant={mapZone === zone ? 'primary' : 'secondary'} onPress={() => setMapZone(zone)} />)}<Button title={mapView === 'map' ? 'Xem danh sách kho' : 'Xem sơ đồ kho'} variant="secondary" onPress={() => setMapView(mapView === 'map' ? 'list' : 'map')} />{mapView === 'map' ? <FloorPlanViewer units={visibleUnits} selectedIds={draft.selectedUnitIds} onPress={fromMap ? undefined : toggleUnit} /> : visibleUnits.map(unit => <Button key={unit.id} title={`${draft.selectedUnitIds.includes(unit.id) ? '✓ ' : ''}${unit.code} · ${unit.available ? 'Có thể đặt' : unit.status === 'RESERVED' ? 'Đã giữ/trùng kỳ' : unit.status === 'OCCUPIED' ? 'Đang thuê' : 'Bảo trì'}`} variant={draft.selectedUnitIds.includes(unit.id) ? 'primary' : 'secondary'} disabled={fromMap || !unit.available} onPress={() => toggleUnit(unit)} />)}<View style={local.legend}><Text style={local.legendAvailable}>Có thể đặt</Text><Text style={local.legendReserved}>Đã giữ/trùng kỳ</Text><Text style={local.legendUnavailable}>Đang thuê/bảo trì</Text></View><Text style={local.selection}>{draft.selectedUnitIds.length ? `Đã chọn ${draft.selectedUnitIds.length}/${draft.quantity}: ${unitMap.units.filter(unit => draft.selectedUnitIds.includes(unit.id)).map(unit => unit.code).join(', ')}` : 'Bạn có thể để hệ thống tự phân bổ, hoặc chọn kho còn trống.'}</Text></View> : null}{fromMap && unitMap && <Button title={showMap ? "Ẩn sơ đồ" : "Xem kho trên sơ đồ"} variant="secondary" onPress={() => setShowMap(value => !value)} />}<PriceBreakdown quote={object(availability?.quote)} />{availability?.available === true && <Button title={submitting ? 'Đang gửi yêu cầu…' : 'Gửi yêu cầu đặt kho'} onPress={() => void submit()} disabled={submitting} />}<Button title="Sửa thời gian thuê" variant="secondary" onPress={() => setStep(2)} /></Panel>}
      {error ? <Text accessibilityRole="alert" selectable style={styles.error}>{error}</Text> : null}
    </>}
  </ScrollView>;
}

function Progress({ step, fromMap }: { step: number; fromMap: boolean }) {
  const stages = fromMap ? [{ title: 'Thời gian', number: 2, icon: CalendarDays }, { title: 'Xác nhận', number: 3, icon: Check }] : [{ title: 'Loại kho', number: 1, icon: Warehouse }, { title: 'Thời gian', number: 2, icon: CalendarDays }, { title: 'Xác nhận', number: 3, icon: Check }];
  return <View style={local.progress}>{stages.map(({ title, number, icon: Icon }) => <View key={title} style={local.progressItem}>
    <View accessibilityElementsHidden style={[local.dot, number <= step && local.dotActive]}><Icon size={16} color={number <= step ? WdpColors.surface : WdpColors.muted} /></View>
    <Text accessibilityLabel={title + (number === step ? ', bước hiện tại' : '')} style={local.progressText}>{title}</Text>
  </View>)}</View>;
}

const local = StyleSheet.create({
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: WdpSpacing.sm },
  progress: { flexDirection: 'row', justifyContent: 'space-between' }, progressItem: { alignItems: 'center', flex: 1, gap: WdpSpacing.xxs }, dot: { alignItems: 'center', backgroundColor: WdpColors.surfaceSecondary, borderRadius: WdpRadius.full, height: 28, justifyContent: 'center', width: 28 }, dotActive: { backgroundColor: WdpColors.teal }, dotText: { color: WdpColors.muted, fontSize: 12, fontWeight: '700' }, dotTextActive: { color: WdpColors.surface }, progressText: { color: WdpColors.muted, fontSize: 12, textAlign: 'center' }, good: { color: WdpColors.success, fontSize: 14, lineHeight: 21 }, bad: { color: WdpColors.danger, fontSize: 14, lineHeight: 21 }, mapSection: { gap: WdpSpacing.sm }, mapTitle: { color: WdpColors.navy, fontSize: 16, fontWeight: '700' }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.xs }, legendAvailable: { color: WdpColors.success, fontSize: 12, fontWeight: '600' }, legendReserved: { color: WdpColors.warning, fontSize: 12, fontWeight: '600' }, legendUnavailable: { color: WdpColors.muted, fontSize: 12, fontWeight: '600' }, selection: { color: WdpColors.text, fontSize: 13, lineHeight: 20 },
});

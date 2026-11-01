import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DateField } from '@/components/date-field';
import { StorageYard, type YardGroup } from '@/components/storage-yard';
import type { FloorPlanUnit } from '@/components/floor-plan-viewer';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { rows, text } from '@/operations/model';
import { Button, Panel, styles } from '@/operations/ui';
import { usePublicCatalog } from '@/hooks/use-public-catalog';
import { apiRequest } from '@/services/api';
import { validDate } from '@/operations/availability';
import { formatMoney } from '@/utils/format';

type UnitMap = { units: FloorPlanUnit[]; groups?: YardGroup[] };
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const monthLater = () => { const date = new Date(today() + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + 31); return date.toISOString().slice(0, 10); };
export default function StorageDiscoveryScreen() {
  const params = useLocalSearchParams<{ size?: string }>();
  const catalog = usePublicCatalog();
  const catalogKey = JSON.stringify(catalog.data?.products ?? []);
  const products = useMemo(() => rows(JSON.parse(catalogKey)), [catalogKey]), sizes = rows(catalog.data?.sizes);
  const [size, setSize] = useState(params.size ?? '');
  const [choice, setChoice] = useState('');
  const [startDate, setStart] = useState(today), [endDate, setEnd] = useState(monthLater);
  const [floorChoice, setFloor] = useState(''), [zoneChoice, setZone] = useState('');
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: UnitMap; error?: string }>();
  const activeSize = sizes.some(item => text(item, 'id') === size) ? size : text(sizes[0] ?? {}, 'id');
  const types = products.filter(item => text(item, 'sizeId') === activeSize);
  const product = types.find(item => text(item, 'id') === choice) ?? types[0];
  const productId = text(product ?? {}, 'id');
  const datesValid = validDate(startDate) && validDate(endDate) && endDate > startDate && startDate >= today();
  const key = JSON.stringify([productId, startDate, endDate, revision]);
  useEffect(() => {
    if (!productId || !datesValid) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      Promise.all(products.map(async product => ({ product, units: (await apiRequest<UnitMap>('/booking/unit-map', { method: 'POST', authenticated: false, signal: controller.signal, body: JSON.stringify({ productId: text(product, 'id'), startDate, endDate, quantity: 1, periodMode: 'dates', paymentPlan: 'PAY_MONTHLY', paymentChoice: 'pay-later', adjacencyPreference: false, addonIds: [] }) })).units }))).then(groups => ({ units: groups.find(group => text(group.product, 'id') === productId)?.units ?? [], groups }))
        .then(data => { if (!controller.signal.aborted) { setSelected(''); setFloor(''); setZone(''); setResult({ key, data }); } })
        .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : 'Không tải được sơ đồ.' }); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [productId, startDate, endDate, datesValid, key, products]);
  const current = result?.key === key ? result : undefined;
  const units = current?.data?.units ?? [];
  const floors = [...new Set(units.map(unit => unit.floor ?? ''))];
  const floor = floors.includes(floorChoice) ? floorChoice : floors[0] ?? '';
  const zones = [...new Set(units.filter(unit => (unit.floor ?? '') === floor).map(unit => unit.zone ?? ''))];
  const zone = zones.includes(zoneChoice) ? zoneChoice : zones[0] ?? '';
  const visible = units.filter(unit => (unit.floor ?? '') === floor && (unit.zone ?? '') === zone);
  const picked = units.find(unit => unit.id === selected && unit.available);
  const dimensions = text(product ?? {}, 'dimensions');
  const refresh = () => { catalog.refresh(); setRevision(value => value + 1); };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={Boolean(productId && datesValid && !current)} onRefresh={refresh} tintColor={WdpColors.navy} />}>
    <Text accessibilityRole="header" style={[styles.title, { fontSize: 26, lineHeight: 34 }]}>Tìm kho trên sơ đồ</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: WdpSpacing.xs }}>{sizes.map(item => <Chip key={text(item, 'id')} title={text(item, 'name')} active={activeSize === text(item, 'id')} onPress={() => { setSize(text(item, 'id')); setChoice(''); }} />)}</ScrollView>
    <View style={{ flexDirection: 'row', gap: WdpSpacing.sm }}><View style={{ flex: 1 }}><DateField title="Ngày nhận" value={startDate} onChange={setStart} /></View><View style={{ flex: 1 }}><DateField title="Ngày trả" value={endDate} onChange={setEnd} /></View></View>
    {!datesValid && <Text style={styles.error}>Chọn ngày nhận từ hôm nay và ngày trả sau ngày nhận.</Text>}
    {catalog.loading && !catalog.data ? <LoadingState /> : catalog.error ? <ErrorState message={catalog.error} onRetry={catalog.refresh} /> : !product ? <EmptyState title="Chưa có loại kho" message="Thử lại sau hoặc chọn nhóm khác." /> : <>
      {types.length > 1 && <ScrollView horizontal contentContainerStyle={{ gap: WdpSpacing.xs }}>{types.map(item => <Chip key={text(item, 'id')} title={text(item, 'name')} active={productId === text(item, 'id')} onPress={() => setChoice(text(item, 'id'))} />)}</ScrollView>}
      <View style={{ gap: WdpSpacing.xxs }}><Text style={styles.title}>{text(product, 'name')}</Text><Text style={styles.copy}>{dimensions} · {typeof product.monthlyPrice === 'number' ? formatMoney(product.monthlyPrice) + '/tháng' : 'Xem báo giá khi đặt'}</Text></View>
      {datesValid && (!current ? <LoadingState label="Đang kiểm tra kho trống…" /> : current.error ? <ErrorState message={current.error} onRetry={() => setRevision(value => value + 1)} /> : !units.length ? <EmptyState title="Chưa có kho trong nhóm này" message="Chọn loại kho khác để tiếp tục." /> : <>
        {floors.length > 1 && <View style={styles.row}>{floors.map(item => <Chip key={item} title={item ? 'Tầng ' + item : 'Chưa gắn tầng'} active={floor === item} onPress={() => { setFloor(item); setZone(''); setSelected(''); }} />)}</View>}
        <View style={styles.row}>{zones.map(item => <Chip key={item} title={item ? 'Khu ' + item : 'Chưa gắn khu'} active={zone === item} onPress={() => { setZone(item); setSelected(''); }} />)}</View>
        <Text style={styles.copy}>{visible.filter(unit => unit.available).length}/{visible.length} kho còn cho kỳ thuê đã chọn</Text>
        <StorageYard groups={current.data?.groups ?? []} selectedId={selected} onSelect={(group, unit) => router.push({ pathname: '/customer/booking', params: { product: text(group.product, 'id'), startDate, endDate, unit: unit.id } })} />
        {picked && <Panel title={picked.code}><Text style={styles.copy}>{dimensions} · Còn kho</Text><Button title="Đặt kho này" onPress={() => router.push({ pathname: '/customer/booking', params: { product: productId, startDate, endDate, unit: picked.id } })} /></Panel>}
      </>)}
    </>}
  </ScrollView>;
}
function Chip({ title, active, onPress }: { title: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, borderRadius: 12, backgroundColor: active ? WdpColors.navy : WdpColors.surface, borderWidth: 1, borderColor: WdpColors.border, opacity: pressed ? 0.75 : 1 })}><Text style={{ color: active ? WdpColors.surface : WdpColors.navy, fontWeight: '600' }}>{title}</Text></Pressable>;
}

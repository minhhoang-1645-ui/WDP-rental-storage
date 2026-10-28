import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import { object, rows, text, type Row } from '@/operations/model';
import { Field, styles } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';
import { formatMoney } from '@/utils/format';

function productMatches(product: Row, query: string, size: string, climateOnly: boolean) {
  const haystack = [text(product, 'name', 'code', 'sizeId', 'condition'), text(object(product.size), 'name', 'dimensions')].join(' ').toLocaleLowerCase('vi');
  return (!query || haystack.includes(query.toLocaleLowerCase('vi'))) && (!size || text(product, 'sizeId') === size) && (!climateOnly || text(product, 'condition') === 'climate');
}

export default function StorageDiscoveryScreen() {
  const params = useLocalSearchParams<{ size?: string }>();
  const catalog = useResource<Row>('/booking/catalog');
  const [query, setQuery] = useState('');
  const [size, setSize] = useState(params.size ?? '');
  const [climateOnly, setClimateOnly] = useState(false);
  const products = rows(catalog.data?.products);
  const sizes = rows(catalog.data?.sizes);
  const shown = useMemo(() => products.filter(product => productMatches(product, query.trim(), size, climateOnly)).sort((left, right) => Number(left.monthlyPrice ?? 0) - Number(right.monthlyPrice ?? 0)), [products, query, size, climateOnly]);
  return <FlatList
    data={catalog.loading || catalog.error ? [] : shown}
    keyExtractor={item => text(item, 'id')}
    contentInsetAdjustmentBehavior="automatic"
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={styles.page}
    refreshControl={<RefreshControl refreshing={catalog.loading && Boolean(catalog.data)} onRefresh={catalog.refresh} tintColor={WdpColors.teal} />}
    ListHeaderComponent={<View style={{ gap: WdpSpacing.sm }}>
      <PageHeader eyebrow="Tìm kho" title="Chọn loại kho phù hợp" description="Thông tin loại kho, giá tham khảo và khả dụng được lấy từ catalog WDP. Số kho thực tế được kiểm tra lại theo ngày thuê." />
      <Field title="Tìm theo tên hoặc kích thước" value={query} onChange={setQuery} maxLength={80} />
      <View style={local.chips}><FilterChip title="Tất cả kích thước" selected={!size} onPress={() => setSize('')} />{sizes.map(item => <FilterChip key={text(item, 'id')} title={text(item, 'name')} selected={size === text(item, 'id')} onPress={() => setSize(text(item, 'id'))} />)}<FilterChip title="Có điều hòa" selected={climateOnly} onPress={() => setClimateOnly(value => !value)} /></View>
      {catalog.loading && !catalog.data ? <LoadingState label="Đang tải loại kho…" /> : catalog.error ? <ErrorState message={catalog.error} onRetry={catalog.refresh} /> : <Text style={styles.copy}>{shown.length} loại kho phù hợp</Text>}
    </View>}
    ItemSeparatorComponent={() => <View style={{ height: WdpSpacing.sm }} />}
    ListEmptyComponent={!catalog.loading && !catalog.error ? <EmptyState title="Không có loại kho phù hợp" message="Thử bỏ bộ lọc hoặc đổi từ khóa tìm kiếm." /> : null}
    renderItem={({ item }) => <StorageTypeCard product={item} size={sizes.find(sizeItem => text(sizeItem, 'id') === text(item, 'sizeId'))} />}
  />;
}

function FilterChip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [local.chip, selected && local.chipSelected, pressed && { opacity: 0.72 }]}><Text style={[local.chipText, selected && local.chipTextSelected]}>{title}</Text></Pressable>;
}

function StorageTypeCard({ product, size }: { product: Row; size?: Row }) {
  const id = text(product, 'id');
  const condition = text(product, 'condition');
  return <Pressable accessibilityRole="button" accessibilityLabel={`Chọn ${text(product, 'name')}`} onPress={() => router.push({ pathname: '/customer/booking', params: { product: id } })} style={({ pressed }) => [local.card, pressed && { opacity: 0.76 }]}>
    <View style={local.cardHeading}><View style={{ flex: 1, gap: WdpSpacing.xxs }}><Text selectable style={local.code}>{text(product, 'code')}</Text><Text style={local.name}>{text(product, 'name')}</Text></View><View style={local.tag}><Text style={local.tagText}>{condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'}</Text></View></View>
    <View style={local.facts}><Fact title="Kích thước" value={text(size ?? {}, 'dimensions', 'floorArea') || 'Xem khi đặt kho'} /><Fact title="Thuê tối thiểu" value={`${text(product, 'minRentalDays') || '—'} ngày`} /><Fact title="Từ mỗi tháng" value={typeof product.monthlyPrice === 'number' ? formatMoney(product.monthlyPrice) : 'Nhận báo giá'} /></View>
    <Text style={local.action}>Chọn loại kho và kiểm tra khả dụng ›</Text>
  </Pressable>;
}

function Fact({ title, value }: { title: string; value: string }) { return <View style={{ flex: 1, gap: WdpSpacing.xxs }}><Text style={local.factTitle}>{title}</Text><Text selectable style={local.factValue}>{value}</Text></View>; }

const local = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.xs },
  chip: { borderColor: WdpColors.border, borderCurve: 'continuous', borderRadius: WdpRadius.full, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: WdpSpacing.sm },
  chipSelected: { backgroundColor: WdpColors.tealSubtle, borderColor: WdpColors.teal },
  chipText: { color: WdpColors.muted, fontSize: 13, fontWeight: '500' },
  chipTextSelected: { color: WdpColors.teal, fontWeight: '600' },
  card: { gap: WdpSpacing.sm, borderColor: WdpColors.border, borderCurve: 'continuous', borderRadius: WdpRadius.lg, borderWidth: 1, backgroundColor: WdpColors.surface, padding: WdpSpacing.md },
  cardHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: WdpSpacing.sm, justifyContent: 'space-between' },
  code: { color: WdpColors.muted, fontSize: 12, fontWeight: '600' },
  name: { color: WdpColors.navy, fontSize: 18, fontWeight: '700', lineHeight: 25 },
  tag: { backgroundColor: WdpColors.tealSubtle, borderRadius: WdpRadius.full, paddingHorizontal: WdpSpacing.xs, paddingVertical: WdpSpacing.xxs },
  tagText: { color: WdpColors.teal, fontSize: 12, fontWeight: '600' },
  facts: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: WdpColors.border, flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.sm, paddingTop: WdpSpacing.sm },
  factTitle: { color: WdpColors.muted, fontSize: 12 },
  factValue: { color: WdpColors.text, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  action: { color: WdpColors.teal, fontSize: 14, fontWeight: '600' },
});

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import { rows, text } from '@/operations/model';
import { Button, styles } from '@/operations/ui';
import { usePublicCatalog } from '@/hooks/use-public-catalog';

const assumptions = [
  { id: 'box', title: 'Thùng carton', area: 0.12, note: 'Giả định thùng xếp chồng an toàn.' },
  { id: 'suitcase', title: 'Vali', area: 0.18, note: 'Giả định đặt nằm hoặc dựng đứng.' },
  { id: 'chair', title: 'Ghế', area: 0.35, note: 'Giả định ghế có thể xếp gọn khi phù hợp.' },
  { id: 'desk', title: 'Bàn làm việc', area: 0.9, note: 'Giả định bàn tháo rời khi có thể.' },
  { id: 'table', title: 'Bàn ăn', area: 1.2, note: 'Giả định bàn không tháo rời.' },
  { id: 'cabinet', title: 'Tủ/kệ', area: 1.1, note: 'Giả định một lối tiếp cận tối thiểu.' },
] as const;

function areaFrom(value: string) { const number = Number(value.replace(',', '.').match(/[\d.]+/)?.[0]); return Number.isFinite(number) ? number : null; }

export default function SizeFinderScreen() {
  const catalog = usePublicCatalog();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const required = assumptions.reduce((sum, item) => sum + item.area * (counts[item.id] ?? 0), 0) * 1.25;
  const sizes = rows(catalog.data?.sizes).map(size => ({ ...size, area: areaFrom(text(size, 'floorArea')) })).filter(size => size.area !== null).sort((a, b) => Number(a.area) - Number(b.area));
  const recommended = useMemo(() => sizes.find(size => Number(size.area) >= required), [required, sizes]);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Tìm kích thước" title="Ước tính kho bạn cần" description="Đây là ước tính diện tích sàn để chọn nhóm kho. Kích thước, giá và khả dụng chính thức được NestBox xác nhận ở bước đặt kho." />
    {catalog.loading && !catalog.data ? <LoadingState label="Đang tải kích thước kho…" /> : catalog.error ? <ErrorState message={catalog.error} onRetry={catalog.refresh} /> : <>
      <View style={local.list}>{assumptions.map(item => <View key={item.id} style={local.item}><View style={{ flex: 1, gap: WdpSpacing.xxs }}><Text style={local.itemTitle}>{item.title}</Text><Text style={local.itemNote}>{item.note}</Text></View><View style={local.counter}><Pressable accessibilityRole="button" accessibilityLabel={`Giảm ${item.title}`} disabled={!counts[item.id]} onPress={() => setCounts(value => ({ ...value, [item.id]: Math.max(0, (value[item.id] ?? 0) - 1) }))} style={local.counterButton}><Text style={local.counterText}>−</Text></Pressable><Text accessibilityLabel={`Số lượng ${item.title}`} style={local.count}>{counts[item.id] ?? 0}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Tăng ${item.title}`} onPress={() => setCounts(value => ({ ...value, [item.id]: Math.min(50, (value[item.id] ?? 0) + 1) }))} style={local.counterButton}><Text style={local.counterText}>+</Text></Pressable></View></View>)}</View>
      <View style={local.result}><Text style={local.resultLabel}>Diện tích ước tính (đã gồm 25% lối đi)</Text><Text style={local.resultValue}>{required ? `${required.toFixed(1)} m²` : 'Chọn đồ cần lưu'}</Text>{required ? recommended ? <><Text style={local.resultCopy}>Gợi ý: {text(recommended, 'name')} · {text(recommended, 'floorArea', 'dimensions')}.</Text><Button title="Xem loại kho phù hợp" onPress={() => router.push({ pathname: '/customer/discover', params: { size: text(recommended, 'id') } })} /></> : <Text style={local.resultCopy}>Danh mục hiện không có nhóm kho nào đủ diện tích ước tính. Vui lòng liên hệ NestBox để được tư vấn.</Text> : <Text style={local.resultCopy}>Kết quả chỉ là định hướng. Đồ cồng kềnh, không xếp chồng hoặc cần lối đi rộng có thể cần kho lớn hơn.</Text>}</View>
      {!sizes.length && <EmptyState title="Thiếu dữ liệu kích thước" message="Catalog chưa trả về diện tích sàn để so sánh. Vui lòng liên hệ hỗ trợ để được tư vấn kích thước." />}
    </>}
  </ScrollView>;
}

const local = StyleSheet.create({
  list: { gap: WdpSpacing.xs }, item: { alignItems: 'center', backgroundColor: WdpColors.surface, borderColor: WdpColors.border, borderCurve: 'continuous', borderRadius: WdpRadius.md, borderWidth: 1, flexDirection: 'row', gap: WdpSpacing.sm, padding: WdpSpacing.sm }, itemTitle: { color: WdpColors.text, fontSize: 15, fontWeight: '600' }, itemNote: { color: WdpColors.muted, fontSize: 12, lineHeight: 17 }, counter: { alignItems: 'center', flexDirection: 'row', gap: WdpSpacing.xs }, counterButton: { alignItems: 'center', backgroundColor: WdpColors.tealSubtle, borderRadius: WdpRadius.full, height: 36, justifyContent: 'center', width: 36 }, counterText: { color: WdpColors.teal, fontSize: 21, fontWeight: '600' }, count: { color: WdpColors.text, fontSize: 16, fontVariant: ['tabular-nums'], minWidth: 20, textAlign: 'center' }, result: { gap: WdpSpacing.sm, backgroundColor: WdpColors.tealSubtle, borderColor: WdpColors.teal, borderCurve: 'continuous', borderRadius: WdpRadius.md, borderWidth: 1, padding: WdpSpacing.md }, resultLabel: { color: WdpColors.teal, fontSize: 13, fontWeight: '600' }, resultValue: { color: WdpColors.navy, fontSize: 28, fontWeight: '700' }, resultCopy: { color: WdpColors.text, fontSize: 14, lineHeight: 21 },
});

import { createContext, useContext, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { WdpColors as C } from '@/constants/wdp-theme';
import { featureAccent } from '@/utils/feature-accent';
import { featureIcon } from '@/utils/ui-icons';
import { staffWorkGroups } from '@/utils/work-queue';
import { codeOf, idOf, label, rows, text, type Row } from '@/operations/model';
import { formatDate } from '@/utils/format';
import { staffStatusTone } from '@/utils/staff-status';

/** Staff-only presentation, never an authorization signal. */
export const StaffPresentation = createContext(false);
export const useStaffPresentation = () => useContext(StaffPresentation);
const titles: Record<string, string> = { reservations: 'Đặt kho', inquiries: 'Tư vấn', 'support-requests': 'Hỗ trợ', appointments: 'Bàn giao', 'stock-movements': 'Nhập – xuất', renewals: 'Gia hạn', transfers: 'Chuyển kho', returns: 'Trả kho', maintenance: 'Bảo trì' };
export function StaffStatusBadge({ status }: { status: string }) {
  const tone = staffStatusTone(status);
  const palette = { warning: [C.warning, C.warningBackground], information: [C.information, C.surfaceSecondary], success: [C.success, C.successBackground], danger: [C.danger, C.dangerBackground], neutral: [C.muted, C.surfaceSecondary] }[tone];
  return <View style={{ alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: palette[1] }}><Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: palette[0], flexShrink: 1 }}>{label(status)}</Text></View>;
}
export function StaffShortcuts({ resources = staffWorkGroups.map(group => group.resource) }: { resources?: readonly string[] }) {
  const { width, fontScale } = useWindowDimensions();
  const columns = width < 350 || fontScale > 1.3 ? 2 : 3;
  const pageSize = columns * 2;
  const pages = Array.from({ length: Math.ceil(resources.length / pageSize) }, (_, index) => resources.slice(index * pageSize, (index + 1) * pageSize));
  const [page, setPage] = useState(0);
  const [measuredWidth, setWidth] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const pageWidth = measuredWidth || width - 32;
  return <View style={staffStyles.surface} onLayout={event => { const next = event.nativeEvent.layout.width; if (next !== measuredWidth) { setWidth(next); setPage(0); scroll.current?.scrollTo({ x: 0, animated: false }); } }}>
    <ScrollView ref={scroll} horizontal pagingEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setPage(Math.max(0, Math.min(pages.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth))))}>
      {pages.map((items, index) => <View key={`${columns}:${index}`} style={[staffStyles.grid, { width: pageWidth, alignContent: 'flex-start' }]}>{items.map(resource => {
    const path = `/staff/${resource}`, Icon = featureIcon(path);
    return <Pressable key={resource} accessibilityRole="button" accessibilityLabel={titles[resource]} onPress={() => router.push(path as Href)} style={({ pressed }) => [staffStyles.shortcut, { width: `${100 / columns}%` }, pressed && staffStyles.pressed]}><View style={[staffStyles.icon, {backgroundColor: featureAccent(path)}]}><Icon size={24} color={C.surface} /></View><Text style={staffStyles.shortcutLabel}>{titles[resource]}</Text></Pressable>;
  })}</View>)}
    </ScrollView>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: 4 }}>{pages.map((_, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Trang nghiệp vụ ${index + 1} trên ${pages.length}`} accessibilityState={{ selected: page === index }} onPress={() => { setPage(index); scroll.current?.scrollTo({ x: index * pageWidth, animated: true }); }} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><View style={{ height: 6, width: page === index ? 20 : 6, borderRadius: 3, backgroundColor: page === index ? C.navy : C.border }} /></Pressable>)}</View>
  </View>;
}
export function StaffLink({ title, description, path }: { title: string; description?: string; path: string }) {
  return <Pressable accessibilityRole="button" onPress={() => router.push(path as Href)} style={({ pressed }) => [staffStyles.link, pressed && staffStyles.pressed]}><View style={{ flex: 1, gap: 4 }}><Text style={staffStyles.body}>{title}</Text>{description ? <Text style={staffStyles.secondary}>{description}</Text> : null}</View><ChevronRight size={20} color={C.muted} /></Pressable>;
}
/** Compact operational identity; full public reference remains in detail. Never fall back to database id. */
export function StaffTaskRow({ resource, row, path, titleOverride }: { resource: string; row: Row; path?: string; titleOverride?: string }) {
  const code = codeOf(row);
  const publicCode = code && (/^WDP-/.test(code) || code !== String(row.id) && code !== String(row.databaseId)) ? code.replace(/^WDP-/, '') : '';
  const shortCode = publicCode.length > 18 ? '…' + publicCode.slice(-16) : publicCode;
  const customer = text(row, 'customer.fullName', 'reservation.customer.fullName');
  const sourceUnit = text(row, 'unit.unitCode', 'storageUnit.unitCode', 'fromUnit.unitCode');
  const targetUnit = text(row, 'toUnit.unitCode') || text(rows(row.transfers)[0] ?? {}, 'toUnit.unitCode');
  const unit = targetUnit && sourceUnit ? `${sourceUnit} → ${targetUnit}` : sourceUnit;
  const when = text(row, 'scheduledAt');
  const domain = resource === 'stock-movements' ? row.type === 'IN' ? 'Nhập hàng' : row.type === 'OUT' ? 'Xuất hàng' : 'Nhập – xuất hàng' : titles[resource] ?? 'Công việc';
  const title = titleOverride || (['support-requests', 'maintenance'].includes(resource) ? text(row, 'subject') || (unit ? `Kho ${unit}` : customer) || domain : customer || (unit ? `Kho ${unit}` : domain));
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${publicCode}, ${label(String(row.status ?? ''))}`} onPress={() => router.push((path ?? `/staff/${resource}/${encodeURIComponent(idOf(row))}`) as Href)} style={({ pressed }) => [staffStyles.link, { backgroundColor: pressed ? C.surfaceSecondary : C.surface, padding: 12, alignItems: 'flex-start' }]}>
    <View style={{ flex: 1, gap: 6 }}><Text style={[staffStyles.body, { fontWeight: '600' }]}>{title}</Text><Text style={staffStyles.secondary}>{[domain, unit && title !== `Kho ${unit}` && `Kho ${unit}`, when && formatDate(when, true)].filter(Boolean).join(' · ')}</Text><StaffStatusBadge status={String(row.status ?? '')} />{Boolean(shortCode) && <Text style={staffStyles.secondary}>{shortCode}</Text>}</View><ChevronRight size={18} color={C.muted} />
  </Pressable>;
}
export function StaffStatusFilters({ values, selected, onChange }: { values: readonly string[]; selected: string; onChange: (value: string) => void }) {
  const scroll = useRef<ScrollView>(null);
  return <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
    {['', ...values].map(value => <Pressable key={value || 'all'} accessibilityRole="button" accessibilityState={{ selected: value === selected }} onLayout={event => { if (value === selected) scroll.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 8), animated: false }); }} onPress={() => onChange(value)} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: 5 }}><View style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: value === selected ? C.navy : C.surfaceSecondary }}><Text style={[staffStyles.secondary, { color: value === selected ? C.surface : C.navy }]}>{value ? label(value) : 'Tất cả'}</Text></View></Pressable>)}
  </ScrollView>;
}
export const staffStyles = StyleSheet.create({
  page: { padding: 16, gap: 20, paddingBottom: 112 },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700', color: C.text },
  section: { fontSize: 17, lineHeight: 24, fontWeight: '600', color: C.text },
  body: { fontSize: 16, lineHeight: 24, color: C.text },
  secondary: { fontSize: 14, lineHeight: 21, color: C.muted },
  surface: { backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.surface, borderRadius: 16, paddingVertical: 8 },
  shortcut: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, gap: 6, minHeight: 84 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center', color: C.text },
  link: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  pressed: { backgroundColor: C.surfaceSecondary },
});

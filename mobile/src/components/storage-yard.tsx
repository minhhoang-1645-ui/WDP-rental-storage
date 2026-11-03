import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WdpColors as c, WdpSpacing as space } from '@/constants/wdp-theme';
import type { FloorPlanUnit } from './floor-plan-viewer';
import { text, type Row } from '@/operations/model';

/** Compact selection diagram; these are not surveyed coordinates. */
export function StorageYard({ product = {}, units, selectedId, onSelect }: {
  product?: Row; units?: FloorPlanUnit[] | null; selectedId: string; onSelect: (unit: FloorPlanUnit) => void;
}) {
  const locker = /locker|tủ/i.test(text(product, 'name'));
  // Fast Refresh can briefly retain the previous caller's props during an update.
  // Never spread missing data or render it as an available storage unit.
  const ordered = (Array.isArray(units) ? [...units] : []).sort((a, b) => (a.row ?? 999999) - (b.row ?? 999999)
    || (a.position ?? 999999) - (b.position ?? 999999) || a.code.localeCompare(b.code, 'vi', { numeric: true }));
  const pairs = Array.from({ length: Math.ceil(ordered.length / 2) }, (_, i) => ordered.slice(i * 2, i * 2 + 2));
  const tile = (unit: FloorPlanUnit) => {
    const chosen = unit.id === selectedId;
    const label = chosen ? 'Đang chọn' : unit.available ? 'Còn trống' : 'Không khả dụng';
    return <Pressable key={unit.id} accessibilityRole="button" accessibilityLabel={`${unit.code}, ${label}`}
      accessibilityState={{ selected: chosen, disabled: !unit.available }} disabled={!unit.available} onPress={() => onSelect(unit)}
      style={({ pressed }) => [s.tile, locker && s.lockerDoor, { minHeight: locker ? 72 : 104,
        backgroundColor: chosen ? c.navy : unit.available ? c.brand : c.background,
        borderColor: unit.available ? c.navy : c.disabled, opacity: pressed ? 0.75 : 1 }]}>
      <Text style={[s.code, { color: chosen ? c.surface : c.navyStrong }]}>{unit.code}</Text>
      {locker && <View style={[s.handle, { backgroundColor: chosen ? c.surface : c.navy }]} />}
    </Pressable>;
  };
  const lockerRack = (bank: FloorPlanUnit[], name: string) => <View style={s.rack}>
    <Text style={s.rackLabel}>{name}</Text>
    {Array.from({ length: Math.ceil(bank.length / 3) }, (_, index) => {
      const row = bank.slice(index * 3, index * 3 + 3);
      return <View key={row[0].id} style={s.lockerRow}>{[0, 1, 2].map(column =>
        <View key={column} style={s.slot}>{row[column] ? tile(row[column]) : null}</View>)}</View>;
    })}
  </View>;
  const split = Math.ceil(ordered.length / 2);
  if (!ordered.length) return <View style={s.building}>
    <Text style={s.heading}>Chưa có dữ liệu sơ đồ</Text>
    <Text style={s.caption}>Chọn lại loại kho hoặc làm mới màn hình để tải sơ đồ.</Text>
  </View>;
  return <View style={s.wrapper}>
    <View style={s.legend}>{[
      { color: c.brand, label: 'Còn trống' }, { color: c.navy, label: 'Đang chọn' }, { color: c.background, label: 'Không khả dụng' },
    ].map(item => <View key={item.label} style={s.legendItem}><View style={[s.swatch, { backgroundColor: item.color }]} /><Text style={s.caption}>{item.label}</Text></View>)}</View>
    <View style={s.building}>
      <Text style={s.heading}>{locker ? 'NHÀ TỦ LƯU TRỮ' : 'KHU KHO'} · {text(product, 'name')}</Text>
      <Text style={s.caption}>Chạm ô còn trống để chọn {locker ? 'tủ' : 'kho'}.</Text>
      {locker ? <View style={s.indoor}>
        {lockerRack(ordered.slice(0, split), 'DÃY TỦ A')}
        <View style={s.lobby}><Text style={s.heading}>SẢNH CHUNG</Text>
          <Text style={s.caption}>Khu vực đi lại và sắp xếp đồ</Text>
          <Text style={s.entrance}>↑ CỬA VÀO ↑</Text>
        </View>
        {ordered.length > 1 && lockerRack(ordered.slice(split), 'DÃY TỦ B')}
      </View> : <View style={s.plan}>{pairs.map((pair, index) => <View key={pair[0].id} style={s.pair}>
        <View style={s.slot}>{tile(pair[0])}</View>
        <View style={s.aisle}>{index === 0 && <Text style={s.aisleText}>LỐI ĐI</Text>}</View>
        <View style={s.slot}>{pair[1] ? tile(pair[1]) : null}</View>
      </View>)}</View>}
      {!locker && <Text style={s.entrance}>↑ LỐI VÀO ↑</Text>}
    </View>
    <Text style={s.caption}>Sơ đồ chọn kho minh họa, không thể hiện vị trí hoặc tỷ lệ thực tế. Trạng thái theo kỳ thuê đã chọn.</Text>
  </View>;
}

const s = StyleSheet.create({
  wrapper: { gap: space.sm }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: c.disabled },
  building: { padding: space.sm, borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.surface, gap: space.xs },
  heading: { fontSize: 14, fontWeight: '700', color: c.navyStrong }, plan: { gap: space.xs, marginTop: space.xs },
  pair: { flexDirection: 'row', alignItems: 'stretch' },
  tile: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 10, padding: space.xs, justifyContent: 'center', alignItems: 'center', gap: space.xxs },
  indoor: { marginTop: space.xs, borderWidth: 2, borderColor: c.border, padding: space.xs, borderRadius: 6, gap: space.sm },
  rack: { gap: space.xxs },
  rackLabel: { fontSize: 10, fontWeight: '700', color: c.muted },
  lockerRow: { flexDirection: 'row', gap: space.xxs },
  lockerDoor: { borderRadius: 4, paddingHorizontal: space.xxs, paddingVertical: space.xs, gap: 2 },
  handle: { width: 14, height: 3, borderRadius: 2, marginTop: space.xxs },
  lobby: { minHeight: 120, backgroundColor: c.soft, justifyContent: 'center', alignItems: 'center', padding: space.sm, gap: space.xs },
  // Identical outer columns keep padding/content from shifting the central aisle.
  slot: { flex: 1, flexBasis: 0, minWidth: 0 }, code: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  caption: { fontSize: 12, lineHeight: 18, color: c.muted, flexShrink: 1 },
  aisle: { width: 36, flexShrink: 0, backgroundColor: c.soft, alignItems: 'center', paddingTop: space.xs, marginHorizontal: space.xxs },
  aisleText: { fontSize: 10, color: c.muted, textAlign: 'center' },
  entrance: { color: c.navy, textAlign: 'center', fontSize: 12, fontWeight: '600', paddingTop: space.xs },
});

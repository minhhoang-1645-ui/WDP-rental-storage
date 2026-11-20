import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import { Button } from '@/operations/ui';
import { text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';

export function storageSpec(product: Row, sizes: Row[], key: string) {
  const size = sizes.find(row => row.id === product.sizeId);
  return String(product[key] ?? '').trim() || String(size?.[key] ?? '').trim();
}

export function storageArea(product: Row, sizes: Row[]) {
  const value = storageSpec(product, sizes, 'floorArea');
  const match = /^(\d+(?:[,.]\d+)?)\s*(?:m²|m2)?$/i.exec(value);
  return match ? Number(match[1].replace(',', '.')) : 0;
}

export function matchingStorage(products: Row[], sizes: Row[], area: number) {
  return products.map(product => ({ product, area: storageArea(product, sizes) }))
    .filter(candidate => candidate.area > 0 && candidate.area >= area - 1e-9)
    .sort((first, second) => first.area - second.area);
}

const price = (row: Row) => typeof row.monthlyPrice === 'number' ? formatMoney(row.monthlyPrice) : 'Chưa công bố';
const blue = '#0758DC';

export function StorageComparison({ products, sizes, onChoose, compact = false }: {
  products: Row[]; sizes: Row[]; compact?: boolean; onChoose: (product: Row) => void;
}) {
  const [open, setOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const selected = ids.flatMap(id => products.filter(row => row.id === id));
  const facts: [string, (row: Row) => string][] = [
    ['Diện tích sàn', row => storageSpec(row, sizes, 'floorArea')],
    ['Rộng × dài × cao', row => storageSpec(row, sizes, 'dimensions')],
    ['Thể tích', row => storageSpec(row, sizes, 'volume')],
    ['Giá / tháng / kho', price],
    ['Tiền cọc', row => typeof row.depositMonths === 'number' ? `${row.depositMonths} tháng tiền thuê` : 'Xem báo giá'],
    ['Thuê ngắn ngày', row => row.allowDailyRental === true
      ? typeof row.minRentalDays === 'number' ? `Tối thiểu ${row.minRentalDays} ngày` : 'Có hỗ trợ'
      : row.allowDailyRental === false ? 'Thuê theo tháng' : 'Chưa công bố'],
    ['Bảo quản', row => row.condition === 'climate' ? 'Có điều hòa' : row.condition === 'standard' ? 'Tiêu chuẩn' : ''],
    ['Vị trí', row => text(row, 'floor')],
    ['Truy cập kho', row => text(row, 'access')],
    ['Tiện ích', row => Array.isArray(row.features) ? row.features.filter(value => typeof value === 'string').join(' · ') : ''],
  ];
  const openComparison = () => {setComparing(false);setOpen(true);};
  return <>
    {compact ? <Pressable accessibilityRole="button" disabled={products.length<2} onPress={openComparison}
      style={{flexGrow:1,minHeight:44,justifyContent:'center',alignItems:'center',paddingHorizontal:6,opacity:products.length<2?0.45:1}}>
      <Text style={{color:blue,fontWeight:'700',fontSize:13}}>So sánh kho ›</Text>
    </Pressable> : <Button title="So sánh kho" variant="secondary" disabled={products.length<2} onPress={openComparison} />}
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={s.overlay}><SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.header}><Text accessibilityRole="header" style={s.title}>So sánh kho</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setOpen(false)} style={s.close}><X size={22} color={blue} /></Pressable>
        </View>
        <Text style={s.copy}>{comparing ? 'Vuốt ngang để xem thêm. Giá thuê chưa gồm cọc và dịch vụ.' : `Chọn 2–3 loại kho · Đã chọn ${selected.length}/3`}</Text>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
          {comparing ? <ScrollView horizontal directionalLockEnabled>
            <View style={s.table}>
              <View style={s.row}><Text style={[s.cell, s.label]}>Thông tin</Text>{selected.map(row => <Text key={text(row, 'id')} style={[s.cell, s.name]}>{text(row, 'name')}</Text>)}</View>
              {facts.map(([label, value]) => <View key={label} style={s.row}>
                <Text style={[s.cell, s.label]}>{label}</Text>
                {selected.map(row => <Text key={text(row, 'id')} style={s.cell}>{value(row) || 'Chưa công bố'}</Text>)}
              </View>)}
              <View style={s.row}><Text style={[s.cell, s.label]}>Đặt kho</Text>{selected.map(row => <Pressable key={text(row, 'id')} accessibilityRole="button"
                style={s.cell} onPress={() => { setOpen(false); onChoose(row); }}><Text style={s.link}>Chọn kho này</Text></Pressable>)}</View>
            </View>
          </ScrollView> : products.map(row => {
            const id = text(row, 'id');
            const checked = ids.includes(id);
            return <Pressable key={id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: !checked && selected.length >= 3 }}
              disabled={!checked && selected.length >= 3} style={[s.option, checked && s.active]}
              onPress={() => setIds(previous => checked ? previous.filter(value => value !== id) : [...previous.filter(value => products.some(product => product.id === value)), id])}>
              <View style={{ flex: 1 }}><Text style={s.name}>{text(row, 'name')}</Text><Text style={s.copy}>{storageSpec(row, sizes, 'floorArea')} · {price(row)}</Text></View>
              {checked ? <Check size={18} color={blue} /> : null}
            </Pressable>;
          })}
        </ScrollView>
        {comparing ? <Button title="Đổi lựa chọn" variant="secondary" onPress={() => setComparing(false)} />
          : <Button title="So sánh ngay" disabled={selected.length < 2} onPress={() => setComparing(true)} />}
      </SafeAreaView></View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#10182866' },
  sheet: { maxHeight: '88%', backgroundColor: 'white', padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#18263B', fontSize: 19, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  copy: { color: '#475569', fontSize: 13, lineHeight: 19 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: '#DCE3ED', borderRadius: 10 },
  active: { backgroundColor: '#EDF3FD', borderColor: blue },
  name: { fontWeight: '700', color: '#18263B' },
  table: { borderWidth: 1, borderColor: '#DCE3ED', borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DCE3ED' },
  cell: { width: 136, minHeight: 44, padding: 10, color: '#18263B', fontSize: 13 },
  label: { width: 110, backgroundColor: '#EDF3FD', fontWeight: '600' },
  link: { color: blue, fontWeight: '700' },
});

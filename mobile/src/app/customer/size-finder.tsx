import { useCallback, useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Armchair, Archive, Boxes, BriefcaseBusiness, ChevronLeft, ChevronRight, Info, Layers, Minus, Package, Plus, Table, Warehouse, X } from 'lucide-react-native';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { StorageComparison, matchingStorage } from '@/components/storage-comparison';
import { usePublicCatalog } from '@/hooks/use-public-catalog';
import { rows, text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';

const items = [
  { id: 'box', icon: Package, name: 'Thùng carton', area: 0.12 },
  { id: 'suitcase', icon: BriefcaseBusiness, name: 'Vali', area: 0.18 },
  { id: 'chair', icon: Armchair, name: 'Ghế', area: 0.35 },
  { id: 'desk', icon: Archive, name: 'Bàn làm việc', area: 0.9 },
  { id: 'table', icon: Table, name: 'Bàn ăn', area: 1.2 },
  { id: 'cabinet', icon: Boxes, name: 'Tủ/kệ', area: 1.1 },
] as const;
type ItemId = typeof items[number]['id'];
const maxQuantity = 50;
const accessAllowance = 0.25;
const format = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function SizeFinderScreen() {
  const [counts, setCounts] = useState<Partial<Record<ItemId, number>>>({});
  const [result, setResult] = useState(false);
  const [explanation, setExplanation] = useState(false);
  const catalog = usePublicCatalog();
  const products = rows(catalog.data?.products);
  const sizes = rows(catalog.data?.sizes);
  const selected = items.filter(item => (counts[item.id] ?? 0) > 0);
  const area = selected.reduce((sum, item) => sum + item.area * (counts[item.id] ?? 0), 0) * (1 + accessAllowance);
  const estimate = format.format(area) + ' m²';
  const matches = area > 0 ? matchingStorage(products, sizes, area) : [];
  const suggestions = matches.slice(0, 3);
  const best = matches[0];
  const choose = (product: Row) => router.push({
    pathname: '/customer/booking', params: { product: text(product, 'id'), minimumArea: String(area) },
  });

  useFocusEffect(useCallback(() => {
    if (!result) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setResult(false); return true; });
    return () => sub.remove();
  }, [result]));

  const change = (id: ItemId, delta: number) => setCounts(previous => ({
    ...previous, [id]: Math.max(0, Math.min(maxQuantity, (previous[id] ?? 0) + delta)),
  }));

  return <View style={s.screen}>
    <Stack.Screen options={{
      title: result ? 'Kết quả ước tính' : 'Ước tính diện tích kho',
      headerTitleAlign: 'center', headerTitleStyle: { color: C.cobalt, fontSize: 17, fontWeight: '700' },
      headerBackVisible: false, gestureEnabled: !result,
      headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={s.headerButton}
        onPress={() => result ? setResult(false) : router.canGoBack() ? router.back() : router.replace('/customer/discover')}>
        <ChevronLeft color={C.cobalt} size={24} />
      </Pressable>,
    }} />
    <ScrollView key={result ? 'result' : 'items'} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
      {result ? <>
        <View style={s.resultIcon}><Warehouse size={50} color={C.cobalt} /><Package size={24} color={C.cobalt} /></View>
        <View style={s.summaryText}><Text style={s.heading}>Diện tích ước tính</Text><Text style={s.value}>Khoảng {estimate}</Text></View>
        <Note>Chỉ mang tính tham khảo. Hãy đối chiếu kích thước đồ, chiều cao kho và cách xếp.</Note>
        <Text style={s.heading}>Kho phù hợp với diện tích ước tính</Text>
        {catalog.loading && !catalog.data ? <Text style={s.copy}>Đang tải loại kho…</Text>
          : catalog.error ? <Pressable accessibilityRole="button" style={s.linkButton} onPress={catalog.refresh}><Text style={s.link}>Chưa tải được loại kho. Thử lại</Text></Pressable>
          : suggestions.length ? <View style={s.selectedList}>{suggestions.map(({ product, area: floorArea }, index) =>
            <Pressable key={text(product, 'id')} accessibilityRole="button" onPress={() => choose(product)}
              style={[s.row, s.selectedRow, index > 0 && s.divider]}>
              <Warehouse size={20} color={C.cobalt} />
              <View style={s.grow}><Text style={s.label}>{text(product, 'name')}</Text>
                {index === 0 ? <Text style={s.link}>Diện tích gần nhất</Text> : null}
                <Text style={s.copy}>{format.format(floorArea)} m²{typeof product.monthlyPrice === 'number' ? ' · ' + formatMoney(product.monthlyPrice) + '/tháng' : ''}</Text>
              </View><ChevronRight size={18} color={C.cobalt} />
            </Pressable>)}</View>
            : <Text style={s.copy}>Chưa tìm thấy loại kho có diện tích đạt mức ước tính.</Text>}
        <Text style={s.copy}>Kiểm tra kho còn trống sau khi chọn ngày thuê.</Text>
        {best && !catalog.error ? <Primary title="Xem kho phù hợp" onPress={() => choose(best.product)} /> : null}
        {matches.length > 1 ? <StorageComparison products={matches.map(item => item.product)} sizes={sizes} onChoose={choose} /> : null}
        <View style={s.spread}><Text style={s.heading}>Đồ đã chọn ({selected.length} loại)</Text>
          <Pressable accessibilityRole="button" style={s.linkButton} onPress={() => setResult(false)}><Text style={s.link}>Chỉnh sửa</Text></Pressable>
        </View>
        <View style={s.selectedList}>{selected.map(({ id, name, icon: Icon }, index) =>
          <View key={id} style={[s.row, s.selectedRow, index > 0 && s.divider]}><Icon size={18} color={C.cobalt} />
            <Text style={[s.label, s.grow]}>{name}</Text><Text style={s.label}>{counts[id]}</Text>
          </View>)}</View>
        {!best && !catalog.loading && !catalog.error ? <Primary title="Xem tất cả loại kho" onPress={() => router.dismissTo('/customer/discover')} /> : null}
      </> : <>
        <View style={s.spread}><Text style={[s.heading, s.grow]}>Chọn đồ bạn muốn lưu</Text>
          {area > 0 ? <Pressable accessibilityRole="button" style={s.linkButton} onPress={() => setCounts({})}><Text style={s.link}>Đặt lại</Text></Pressable> : null}
        </View>
        <View style={s.list}>{items.map(({ id, name, icon: Icon }) => {
          const quantity = counts[id] ?? 0;
          return <View key={id} style={[s.row, s.item]}>
            <Icon size={20} color={C.cobalt} /><Text style={[s.label, s.grow]}>{name}</Text>
            <QuantityButton label={'Giảm ' + name} disabled={!quantity} onPress={() => change(id, -1)} />
            <Text accessibilityLabel={name + ', số lượng ' + quantity} style={s.count}>{quantity}</Text>
            <QuantityButton label={'Tăng ' + name} plus disabled={quantity >= maxQuantity} onPress={() => change(id, 1)} />
          </View>;
        })}</View>
        <Pressable accessibilityRole="button" style={[s.row, s.linkButton]} onPress={() => setExplanation(true)}>
          <Info size={17} color={C.cobalt} /><Text style={s.link}>Xem cách tính</Text><ChevronRight size={15} color={C.cobalt} />
        </Pressable>
        <View style={s.summary} accessibilityLiveRegion="polite"><Text style={s.heading}>Diện tích ước tính</Text>
          {area > 0 ? <><Text style={s.value}>{estimate}</Text><Text style={s.copy}>Số liệu tham khảo, tùy theo kích thước và cách xếp đồ.</Text></>
            : <Text style={s.copy}>Chọn ít nhất một món đồ để ước tính.</Text>}
          {best && !catalog.error ? <Text style={s.label}>Gợi ý: {text(best.product, 'name')} · {format.format(best.area)} m²</Text> : null}
        </View>
        <Primary title="Xem kho phù hợp" disabled={!area} onPress={() => setResult(true)} />
      </>}
    </ScrollView>
    <Modal visible={explanation} transparent animationType="slide" onRequestClose={() => setExplanation(false)}>
      <View style={s.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng cách ước tính" onPress={() => setExplanation(false)} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['bottom']} style={s.sheet}>
          <View style={s.handle} />
          <View style={s.spread}><Text style={s.heading}>Cách ước tính</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng" style={s.headerButton} onPress={() => setExplanation(false)}><X size={21} color={C.text} /></Pressable>
          </View>
          <ScrollView style={s.sheetScroll} contentContainerStyle={s.explanations}>
            <View style={s.explain}><Package size={21} color={C.cobalt} /><View style={s.grow}><Text style={s.label}>Diện tích đồ vật</Text>
              <Text style={s.copy}>Lấy số lượng nhân với diện tích sàn tham khảo của từng loại đồ, rồi cộng lại.</Text>
              <Text style={s.copy}>{items.map(item => item.name + ' ' + item.area.toLocaleString('vi-VN') + ' m²').join(' · ')}</Text>
            </View></View>
            <View style={s.explain}><Layers size={21} color={C.cobalt} /><View style={s.grow}><Text style={s.label}>Cách xếp đồ</Text>
              <Text style={s.copy}>Số tham khảo giả định thùng có thể xếp chồng, ghế xếp gọn và bàn làm việc tháo rời khi phù hợp. Chiều cao kho và kích thước thực của đồ cần được kiểm tra riêng.</Text>
            </View></View>
            <View style={s.explain}><Warehouse size={21} color={C.cobalt} /><View style={s.grow}><Text style={s.label}>Lối đi và chỗ thao tác</Text>
              <Text style={s.copy}>Cộng thêm {accessAllowance * 100}% vào tổng diện tích đồ để chừa chỗ đi lại và lấy đồ.</Text>
            </View></View>
            <Note>Sức chứa thực tế phụ thuộc vào cách sắp xếp trong kho.</Note>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}

function QuantityButton({ label, plus, disabled, onPress }: { label: string; plus?: boolean; disabled: boolean; onPress: () => void }) {
  const Icon = plus ? Plus : Minus;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={s.stepper}>
    <View style={[s.circle, disabled && s.disabled]}><Icon size={17} color={C.cobalt} /></View>
  </Pressable>;
}

function Primary({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[s.primary, disabled && s.disabled]}><Text style={s.primaryText}>{title}</Text><ChevronRight size={19} color="white" /></Pressable>;
}

function Note({ children }: { children: string }) {
  return <View style={[s.row, s.summary]}><Info size={18} color={C.cobalt} /><Text style={[s.copy, s.grow]}>{children}</Text></View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  page: { width: '100%', maxWidth: 540, alignSelf: 'center', padding: 16, gap: 12, paddingBottom: 24 },
  headerButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  list: { gap: 7 },
  item: { borderWidth: 1, borderColor: '#E6ECF5', borderRadius: 11, paddingLeft: 11, paddingRight: 5, minHeight: 49 },
  grow: { flex: 1, minWidth: 0 },
  heading: { fontSize: 16, fontWeight: '700', color: C.text },
  label: { color: C.text, fontSize: 14, fontWeight: '600' },
  copy: { color: C.muted, fontSize: 13, lineHeight: 19 },
  stepper: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EAF0FD', alignItems: 'center', justifyContent: 'center' },
  count: { color: C.text, minWidth: 19, textAlign: 'center', fontWeight: '700', fontVariant: ['tabular-nums'] },
  summary: { backgroundColor: '#EAF1FD', borderRadius: 12, padding: 12, gap: 6 },
  summaryText: { gap: 5 },
  value: { color: C.cobalt, fontSize: 30, fontWeight: '800' },
  resultIcon: { alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', gap: 5, paddingVertical: 8 },
  selectedList: { backgroundColor: '#F2F6FD', borderRadius: 11, paddingHorizontal: 10 },
  selectedRow: { minHeight: 38, paddingVertical: 6 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D5E0F0' },
  linkButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { fontWeight: '700', fontSize: 14, color: C.cobalt },
  primary: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: C.cobalt, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryText: { color: 'white', fontWeight: '700', fontSize: 15, textAlign: 'center', flexShrink: 1 },
  disabled: { opacity: 0.5 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#131C3080' },
  sheet: { backgroundColor: 'white', maxHeight: '80%', paddingHorizontal: 16, paddingTop: 9, paddingBottom: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#AEB9C9', alignSelf: 'center' },
  sheetScroll: { flexGrow: 0 },
  explanations: { gap: 14, paddingBottom: 8 },
  explain: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
});

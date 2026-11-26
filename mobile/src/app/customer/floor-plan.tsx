import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Building2, ChevronLeft, Grid2X2, Headphones, Layers, Map, Navigation, Rows3, Warehouse } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { StorageFloorPlan } from '@/components/storage-floor-plan';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { rentalFloorPlan } from '@/utils/rental-floor-plan';

const blue = '#175CD3';

function formatFloor(value: string) {
  if (/^ground(?: floor)?$/i.test(value)) return 'Tầng trệt';
  if (/^floor\s+\d+$/i.test(value)) return value.replace(/^floor\s+/i, 'Tầng ');
  if (/^\d+$/.test(value)) return `Tầng ${value}`;
  return value;
}

function LocationDetails({ rental, contract }: { rental: Row; contract: Row }) {
  const unit = object(contract.unit);
  const storageType = object(unit.storageType);
  const facility = Object.keys(object(storageType.facility)).length ? object(storageType.facility) : object(rental.facility);
  const facilityName = text(facility, 'name').trim();
  const address = text(facility, 'address').trim();
  const hasDirections = !!address && !/mô phỏng|lưu trữ demo|^demo$/i.test(address);
  const code = text(unit, 'unitCode').trim();
  const unitId = idOf(unit);
  const plan = rentalFloorPlan(rental, unitId);
  const zone = text(unit, 'zone').trim();
  const row = text(unit, 'row').trim();
  const information = [
    { icon: Layers, value: formatFloor(text(unit, 'floor').trim()) },
    { icon: Grid2X2, value: zone && (/^khu\s/i.test(zone) ? zone : 'Khu ' + zone) },
    { icon: Rows3, value: row && 'Hàng ' + row },
  ];
  const reservationId = text(rental, 'reservationId');
  async function directions() {
    const query = encodeURIComponent(address);
    const url = Platform.OS === 'ios' ? 'https://maps.apple.com/?daddr=' + query
      : 'https://www.google.com/maps/dir/?api=1&destination=' + query;
    try { await Linking.openURL(url); }
    catch { Alert.alert('Không mở được bản đồ', 'Địa chỉ cơ sở: ' + address); }
  }

  return <>
    <View style={[styles.card, styles.facility]}>
      <View style={styles.identity}>
        <View style={styles.icon}><Building2 size={25} color={blue} /></View>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{facilityName || 'Chưa có thông tin cơ sở'}</Text>
          {!!address && <Text selectable style={styles.secondary}>{address}</Text>}
        </View>
        {hasDirections && <Pressable accessibilityRole="button" onPress={() => void directions()} style={styles.directions}>
          <Navigation size={16} color={blue} /><Text style={styles.actionText}>Chỉ đường</Text>
        </Pressable>}
      </View>
    </View>

    <View style={styles.card}>
      <View style={styles.identity}>
        <View style={styles.icon}><Warehouse size={27} color={blue} /></View>
        <View style={styles.heading}>
          <Text selectable accessibilityRole="header" style={styles.code}>{code || 'Chưa có mã ô kho'}</Text>
          <Text style={styles.secondary}>{text(storageType, 'name') || text(rental, 'storageType.name') || 'Kho của bạn'}</Text>
        </View>
      </View>
      {information.some(item => item.value) && <View style={styles.chips}>{information.filter(item => item.value).map(({ icon: Icon, value }) =>
        <View key={value} style={styles.chip}><Icon size={15} color="#475467" /><Text style={styles.chipText}>{value}</Text></View>
      )}</View>}
    </View>

    <View style={styles.card}>
      <View style={styles.sectionTitle}>
        <Map size={23} color={blue} />
        <Text accessibilityRole="header" style={[styles.title, styles.heading]}>Sơ đồ kho</Text>
        {plan && <Text style={[styles.secondary, styles.tag]}>Sơ đồ minh họa</Text>}
      </View>
      {plan && code
        ? <StorageFloorPlan key={unitId} plan={plan} unitId={unitId} unitCode={code} />
        : <View style={styles.mapEmpty}><Map size={25} color={blue} /><Text style={styles.secondary}>Chưa có sơ đồ cơ sở</Text></View>}
    </View>

    <Pressable accessibilityRole="button" style={styles.contact} onPress={() => reservationId
      ? router.push({ pathname: '/customer/[resource]/[id]', params: { resource: 'support-requests', id: 'new', reservationId, rentalContractId: idOf(contract) } })
      : router.push({ pathname: '/customer/[resource]', params: { resource: 'support-requests' } })}>
      <Headphones size={22} color={blue} /><Text style={styles.contactText}>Liên hệ nhân viên</Text>
    </Pressable>
  </>;
}

export default function Screen() {
  const { rentalId, rentalContractId } = useLocalSearchParams<{ rentalId?: string; rentalContractId?: string }>();
  const source = useResource<Row>(rentalId ? `/customer/rentals/${encodeURIComponent(rentalId)}` : null);
  const rental = source.data;
  const contracts = rows(rental?.contracts).filter(item => item.status === 'ACTIVE' && idOf(item));
  const contract = rentalContractId ? contracts.find(item => idOf(item) === rentalContractId) : contracts[0];

  return <>
    <Stack.Screen options={{ title: 'Vị trí kho', headerTitleAlign: 'center', headerBackVisible: false, headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/customer/rentals')}><ChevronLeft size={24} color="#101828" /></Pressable>, headerTitleStyle: { color: blue, fontSize: 20, fontWeight: '700' } }} />
    <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
      {source.loading ? <LoadingState layout="detail" label="Đang tải vị trí kho…" />
        : source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
        : <>
          {contracts.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitChoices}>
            {contracts.map(item => {
              const id = idOf(item);
              const selected = id === idOf(contract ?? {});
              return <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: selected }}
                onPress={() => router.setParams({ rentalContractId: id })} style={[styles.unitChoice, selected && styles.selectedChoice]}>
                <Text style={[styles.choiceText, selected && styles.selectedChoiceText]}>{text(item, 'unit.unitCode', 'contractCode')}</Text>
              </Pressable>;
            })}
          </ScrollView> : null}
          {rental && contract ? <LocationDetails key={idOf(contract) + ":" + text(contract, "unit.id")} rental={rental} contract={contract} />
            : <>
              <EmptyState title="Chưa có thông tin vị trí" message="Chọn một ô kho đang thuê để xem vị trí." />
              <Pressable accessibilityRole="button" style={styles.contact} onPress={() => router.navigate('/customer/rentals')}>
                <Text style={styles.contactText}>Về Kho thuê</Text>
              </Pressable>
            </>}
        </>}
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#E4E7EC' },
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  page: { padding: 16, paddingBottom: 20, gap: 13, width: '100%', maxWidth: 600, alignSelf: 'center' },
  card: { borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 16, padding: 12, gap: 9, backgroundColor: 'white' },
  facility: { paddingVertical: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  heading: { flex: 1, minWidth: 105 },
  title: { color: '#101828', fontSize: 18, fontWeight: '700' },
  code: { color: '#101828', fontSize: 24, fontWeight: '800' },
  secondary: { color: '#475467', fontSize: 14, lineHeight: 19 },
  icon: { width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF2FF' },
  directions: { flexDirection: 'row', minHeight: 44, alignItems: 'center', gap: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: blue, borderRadius: 10 },
  actionText: { color: blue, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EFF5FF', borderRadius: 16, paddingVertical: 5, paddingHorizontal: 8, maxWidth: '100%' },
  chipText: { color: '#101828', fontSize: 13, flexShrink: 1 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  tag: { backgroundColor: '#F2F4F7', borderRadius: 13, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12 },
  mapEmpty: { alignItems: 'center', justifyContent: 'center', padding: 18, minHeight: 118, gap: 9, backgroundColor: '#F7F8FA', borderRadius: 12 },
  contact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: blue, backgroundColor: 'white' },
  contactText: { color: blue, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  unitChoices: { gap: 8 },
  unitChoice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 10 },
  selectedChoice: { borderColor: blue, backgroundColor: '#EFF5FF' },
  choiceText: { color: '#101828', fontSize: 13, fontWeight: '600' },
  selectedChoiceText: { color: blue },
});

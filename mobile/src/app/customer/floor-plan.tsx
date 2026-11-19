import { useEffect, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Box, Grid2X2, Headphones, Layers, Map, MapPin, Rows3, Warehouse } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { customerStyles } from '@/components/customer-premium';
import { BookingUnitSelector } from '@/components/booking-unit-selector';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import type { FloorPlanUnit } from '@/components/floor-plan-viewer';
import { apiRequest } from '@/services/api';
import { vietnamCalendarDate } from '@/utils/calendar-date';

function formatFloor(value: string) {
  if (/^ground(?: floor)?$/i.test(value)) return 'Tầng trệt';
  if (/^floor\s+\d+$/i.test(value)) return value.replace(/^floor\s+/i, 'Tầng ');
  if (/^\d+$/.test(value)) return `Tầng ${value}`;
  return value;
}

function LocationDetails({ rental, contract }: { rental: Row; contract: Row }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width >= 350 && fontScale <= 1.2;
  const unit = object(contract.unit);
  const code = text(unit, 'unitCode').trim();
  const floor = formatFloor(text(unit, 'floor').trim());
  const zone = text(unit, 'zone').trim();
  const row = text(unit, 'row').trim();
  const position = text(unit, 'position').trim();
  const location = [
    { label: 'Tầng', value: floor, icon: Layers },
    { label: 'Khu', value: zone && (/^khu\b/i.test(zone) ? zone : `Khu ${zone}`), icon: Grid2X2 },
    { label: 'Hàng', value: row && `Hàng ${row}`, icon: Rows3 },
    { label: 'Vị trí', value: position && `Ô số ${position}`, icon: Box },
  ];
  const locationSummary = location.map(field => field.value).filter(Boolean).join(' · ');
  const reservationId = text(rental, 'reservationId');
  const unitId = idOf(unit);
  const layout = rows(rental.unitLayouts).find(item => text(item, 'unitId') === unitId);
  const layoutUnits = rows(layout?.units).map(item => ({
    id: idOf(item),
    code: text(item, 'code'),
    row: typeof item.row === 'number' ? item.row : null,
    position: typeof item.position === 'number' ? item.position : null,
  })).filter(item => item.id && item.code);
  const hasLayout = layoutUnits.some(item => item.id === unitId);
  const productId = text(rental, 'storageType.id');
  const [bookingLayout, setBookingLayout] = useState<{ unitId: string; units: FloorPlanUnit[] }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (hasLayout || !productId || !unitId) return;
    const controller = new AbortController();
    const startDate = vietnamCalendarDate();
    apiRequest<{ units: FloorPlanUnit[] }>('/booking/unit-map', {
      method: 'POST',
      authenticated: false,
      signal: controller.signal,
      body: JSON.stringify({
        productId, startDate, periodMode: 'dates',
        endDate: vietnamCalendarDate(Date.now() + 86400000),
        quantity: 1, paymentPlan: 'PREPAID', paymentChoice: 'pay-later',
      }),
    }).then(result => {
      if (controller.signal.aborted) return;
      const units = Array.isArray(result.units) ? result.units : [];
      const assigned = units.find(item => item.id === unitId);
      setBookingLayout({ unitId, units: assigned?.floor && assigned.zone
        ? units.filter(item => item.floor === assigned.floor && item.zone === assigned.zone) : [] });
    }).catch(() => {
      if (!controller.signal.aborted) setBookingLayout({ unitId, units: [] });
    });
    return () => controller.abort();
  }, [hasLayout, productId, unitId, retry]);
  const backup = bookingLayout?.unitId === unitId ? bookingLayout.units : undefined;
  const mapUnits = hasLayout ? layoutUnits : backup ?? [];
  const loadingMap = !hasLayout && Boolean(productId && unitId) && !backup;

  return <>
    <View style={styles.card}>
      <View style={styles.identity}>
        <View style={styles.warehouseIcon}><Warehouse size={28} color={C.navy} /></View>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.warehouseName}>{text(rental, 'storageType.name') || 'Kho của bạn'}</Text>
          <Text selectable style={customerStyles.secondary}>{code ? `Ô kho ${code}` : 'Chưa có mã ô kho'}</Text>
        </View>
      </View>
      <View style={styles.locationGrid}>
        {location.map(({ label, value, icon: Icon }, index) => <View key={label}
          style={[styles.locationField, compact ? styles.quarter : styles.half, index % (compact ? 4 : 2) !== 0 && styles.fieldDivider]}>
          <Icon size={19} color={C.muted} strokeWidth={1.7} />
          <Text style={[styles.fieldValue, !value && styles.missingField]}>{value || `${label}: chưa ghi nhận`}</Text>
        </View>)}
      </View>
    </View>

    <View style={styles.card}>
      <View style={styles.sectionTitle}>
        <Map size={22} color={C.navy} />
        <Text accessibilityRole="header" style={[customerStyles.section, styles.heading]}>Sơ đồ ô kho</Text>
      </View>
      {mapUnits.length ? <BookingUnitSelector units={mapUnits} selected={[unitId]} /> : <View style={styles.mapEmpty}>
        <View style={styles.smallIcon}><MapPin size={22} color={C.navy} /></View>
        <Text style={styles.emptyText}>{loadingMap ? 'Đang tải sơ đồ…' : 'Chưa tải được sơ đồ các ô cùng khu.'}</Text>
        {!loadingMap && productId && unitId ? <Pressable accessibilityRole="button" style={styles.contact}
          onPress={() => { setBookingLayout(undefined); setRetry(value => value + 1); }}>
          <Text style={styles.contactText}>Thử lại</Text>
        </Pressable> : null}
      </View>}
    </View>

    <View style={styles.identity}>
      <View style={styles.smallIcon}><MapPin size={22} color={C.navy} /></View>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={customerStyles.section}>Vị trí của bạn</Text>
        <Text style={customerStyles.secondary}>{locationSummary || 'Vị trí ô kho chưa được cập nhật.'}</Text>
      </View>
    </View>

    {reservationId ? <>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/customer/[resource]/[id]", params: { resource: "support-requests", id: "new", reservationId, rentalContractId: idOf(contract) } })} style={({ pressed }) => [styles.contact, pressed && styles.pressed]}>
        <Headphones size={21} color={C.navy} />
        <Text style={styles.contactText}>Liên hệ nhân viên</Text>
      </Pressable>
    </> : null}
  </>;
}

export default function Screen() {
  const { rentalId, rentalContractId } = useLocalSearchParams<{ rentalId?: string; rentalContractId?: string }>();
  const source = useResource<Row>(rentalId ? `/customer/rentals/${encodeURIComponent(rentalId)}` : null);
  const rental = source.data;
  const contracts = rows(rental?.contracts).filter(item => item.status === 'ACTIVE' && idOf(item));
  const contract = rentalContractId ? contracts.find(item => idOf(item) === rentalContractId) : contracts[0];

  return <>
    <Stack.Screen options={{ title: 'Vị trí kho', headerTitleAlign: 'center', headerTitleStyle: { color: C.navy, fontSize: 20, fontWeight: '700' } }} />
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
          {rental && contract ? <LocationDetails key={idOf(contract)} rental={rental} contract={contract} />
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
  screen: { flex: 1, backgroundColor: C.surface },
  page: { padding: 16, paddingBottom: 24, gap: 14, width: '100%', maxWidth: 600, alignSelf: 'center' },
  card: { borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 12, gap: 12, backgroundColor: C.surface },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1 },
  warehouseName: { fontSize: 19, fontWeight: '700', color: C.text },
  warehouseIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tealSubtle },
  locationGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.divider },
  locationField: { alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
  quarter: { width: '25%' },
  half: { width: '50%' },
  fieldDivider: { borderLeftColor: C.divider, borderLeftWidth: 1 },
  fieldValue: { fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'center' },
  missingField: { color: C.muted, fontWeight: '500' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mapEmpty: { alignItems: 'center', justifyContent: 'center', padding: 18, minHeight: 132, gap: 9, backgroundColor: C.soft, borderRadius: 11 },
  smallIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tealSubtle },
  emptyText: { color: C.muted, fontSize: 14, lineHeight: 20, maxWidth: 240, textAlign: 'center' },
  contact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.navy },
  contactText: { color: C.navy, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  pressed: { backgroundColor: C.tealSubtle },
  unitChoices: { gap: 8 },
  unitChoice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, borderRadius: 10 },
  selectedChoice: { borderColor: C.navy, backgroundColor: C.tealSubtle },
  choiceText: { color: C.text, fontSize: 13, fontWeight: '600' },
  selectedChoiceText: { color: C.navy },
});

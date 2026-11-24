import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Button, styles } from '@/operations/ui';
import { EmptyState } from './screen-state';

export type BookingFacility = {
  id: string;
  name: string;
  address: string;
  operationalStatus: 'OPEN' | 'CLOSED';
  bookingEnabled: boolean;
  officeHours?: string;
  accessHours?: string;
};

export function isBookingFacility(value: unknown): value is BookingFacility {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && Boolean(row.id.trim())
    && typeof row.name === 'string' && Boolean(row.name.trim())
    && typeof row.address === 'string'
    && (row.operationalStatus === 'OPEN' || row.operationalStatus === 'CLOSED')
    && typeof row.bookingEnabled === 'boolean'
    && (row.officeHours === undefined || typeof row.officeHours === 'string')
    && (row.accessHours === undefined || typeof row.accessHours === 'string');
}

export function acceptsBookings(facility?: BookingFacility) {
  return facility?.operationalStatus === 'OPEN' && facility.bookingEnabled;
}

export function BookingFacilityPicker({ facilities, selected, onSelect, onBack }: {
  facilities: BookingFacility[];
  selected: string;
  onSelect: (facility: BookingFacility) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState('');
  const detail = facilities.find(item => item.id === detailId);
  const phrase = search.trim().toLocaleLowerCase('vi-VN');
  const visible = facilities.filter(item => (item.name + ' ' + item.address).toLocaleLowerCase('vi-VN').includes(phrase));
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
    <Button title={detail ? 'Về danh sách cơ sở' : 'Quay lại'} variant="secondary"
      onPress={detail ? () => setDetailId('') : onBack} />
    {detail ? <>
      <Text accessibilityRole="header" style={styles.title}>{detail.name}</Text>
      <Text style={styles.copy}>{detail.address}</Text>
      {detail.officeHours ? <Text style={styles.copy}>Giờ văn phòng · {detail.officeHours}</Text> : null}
      {detail.accessHours ? <Text style={styles.copy}>Giờ vào kho · {detail.accessHours}</Text> : null}
      <Text style={styles.copy}>{acceptsBookings(detail) ? 'Đang nhận đặt kho' : 'Tạm dừng nhận đặt kho'}</Text>
      <Button title="Chọn cơ sở này" disabled={!acceptsBookings(detail)} onPress={() => onSelect(detail)} />
    </> : <>
      <Text accessibilityRole="header" style={styles.title}>Chọn cơ sở</Text>
      <TextInput accessibilityLabel="Tìm cơ sở theo tên hoặc địa chỉ" placeholder="Tìm tên hoặc địa chỉ"
        style={styles.input} value={search} onChangeText={setSearch} />
      {visible.map(item => <View key={item.id} style={{ gap: 6 }}>
        <Text style={styles.title}>{item.name}{item.id === selected ? ' · Đang chọn' : ''}</Text>
        <Text style={styles.copy}>{item.address}</Text>
        <Text style={styles.copy}>{acceptsBookings(item) ? 'Đang nhận đặt kho' : 'Tạm dừng nhận đặt kho'}</Text>
        <Button title="Xem chi tiết" variant="secondary" onPress={() => setDetailId(item.id)} />
      </View>)}
      {!visible.length && <EmptyState title="Chưa tìm thấy cơ sở" message="Thử tìm bằng tên hoặc địa chỉ khác." />}
    </>}
  </ScrollView>;
}

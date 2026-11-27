import { BookingHeader } from './booking-header';
import { useState } from 'react';
import { Image } from 'expo-image';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowRight, Check, ChevronRight, Clock3, MapPin, Search, Warehouse, X } from 'lucide-react-native';
export type BookingFacility = {
  id: string;
  name: string;
  address: string;
  operationalStatus: 'OPEN' | 'CLOSED';
  bookingEnabled: boolean;
  photo?: string | null;
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


const blue = '#0758DC';
const navy = '#0C1B32';
const muted = '#627184';
const border = '#D8E0EA';

const normalize = (value: string) => value.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();

export function BookingFacilityPicker({ facilities, selected, onSelect, onBack, loading, error, onRetry }: {
  facilities: BookingFacility[];
  selected: string;
  onSelect: (facility: BookingFacility) => void;
  onBack: () => void;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(selected);
  const [detailId, setDetailId] = useState('');
  const detail = facilities.find(item => item.id === detailId);
  const accepting = facilities.filter(acceptsBookings);
  const choice = accepting.find(item => item.id === pending);
  const phrase = normalize(search);
  const visible = facilities.filter(item => normalize(item.name + ' ' + item.address).includes(phrase));
  const canContinue = Boolean(choice && !error && !loading);

  return <View style={ui.screen}>
    <BookingHeader step={1} title={detail ? 'Chi tiết cơ sở' : undefined} onBack={detail ? () => setDetailId('') : onBack} />
    {detail ? <ScrollView contentContainerStyle={ui.detail}>
      <Cover key={detail.id} photo={detail.photo} detail />
      <Text accessibilityRole="header" style={ui.heroTitle}>{detail.name}</Text>
      <Status available={acceptsBookings(detail)} />
      {detail.address ? <Fact kind="address" value={detail.address} /> : <Text style={ui.secondary}>Chưa có thông tin địa chỉ.</Text>}
      {detail.officeHours ? <Fact kind="hours" value={'Giờ văn phòng · ' + detail.officeHours} /> : null}
      {detail.accessHours ? <Fact kind="hours" value={'Giờ vào kho · ' + detail.accessHours} /> : null}
      <Action title="Chọn cơ sở này" disabled={!acceptsBookings(detail) || Boolean(error) || loading}
        onPress={() => { setPending(detail.id); setDetailId(''); }} />
    </ScrollView> : <>
      <FlatList data={error || loading ? [] : visible} keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled" contentContainerStyle={ui.list}
        ListHeaderComponent={<View style={ui.intro}>
          <View style={ui.hero}>
            <View style={ui.heroCopy}>
              <Text accessibilityRole="header" style={ui.heroTitle}>Chọn cơ sở lưu trữ</Text>
              <Text style={ui.secondary}>Chọn cơ sở phù hợp với vị trí và nhu cầu của bạn.</Text>
            </View>
            <View style={ui.illustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Warehouse size={52} color="#25639A" strokeWidth={1.55} />
              <MapPin size={20} color="#3B8BCC" style={ui.pin} />
            </View>
          </View>
          <View style={ui.search}>
            <Search size={20} color={muted} />
            <TextInput accessibilityLabel="Tìm tên cơ sở, khu vực hoặc địa chỉ"
              placeholder="Tìm tên cơ sở, khu vực hoặc địa chỉ" placeholderTextColor={muted}
              value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" style={ui.input} />
            {search ? <Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm"
              style={ui.clear} onPress={() => setSearch('')}><X size={18} color={muted} /></Pressable> : null}
          </View>
          <Text accessibilityRole="header" style={ui.section}>Cơ sở lưu trữ{!loading && !error ? ' (' + visible.length + ')' : ''}</Text>
        </View>}
        renderItem={({ item }) => <View style={[ui.card, item.id === choice?.id && ui.selected]}>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: item.id === choice?.id, disabled: !acceptsBookings(item) }} disabled={!acceptsBookings(item)}
            accessibilityLabel={item.name} onPress={() => setPending(item.id)} style={ui.cardMain}>
            <Cover photo={item.photo} />
            <View style={ui.cardCopy}>
              <Text style={ui.name}>{item.name}</Text>
              <Status available={acceptsBookings(item)} />
              {item.address ? <Fact kind="address" value={item.address} /> : null}
              {item.officeHours || item.accessHours
                ? <Fact kind="hours" value={item.officeHours || item.accessHours || ''} /> : null}
            </View>
            {acceptsBookings(item) && <View style={[ui.radio, item.id === pending && ui.checked]}>
              {item.id === pending ? <Check color="white" size={15} strokeWidth={3} /> : null}
            </View>}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={'Xem chi tiết ' + item.name}
            style={ui.detailsLink} onPress={() => setDetailId(item.id)}>
            <Text style={ui.link}>Xem chi tiết</Text><ChevronRight size={16} color={blue} />
          </Pressable>
        </View>}
        ListEmptyComponent={loading ? <View accessibilityLabel="Đang tải cơ sở" style={ui.skeletons}>
          {[0, 1, 2].map(key => <View key={key} style={ui.skeleton} />)}
        </View> : <View style={ui.empty}>
          <Text accessibilityRole="header" style={ui.name}>{error ? 'Không tải được danh sách cơ sở'
            : phrase && facilities.length ? 'Không tìm thấy cơ sở' : 'Chưa có cơ sở được công bố'}</Text>
          <Text style={ui.secondary}>{error || (phrase && facilities.length
            ? 'Thử tìm bằng tên cơ sở hoặc địa chỉ khác.' : 'Hiện tại chưa có cơ sở phù hợp. Vui lòng quay lại sau.')}</Text>
          {error || phrase ? <Action title={error ? 'Thử lại' : 'Xóa tìm kiếm'}
            onPress={error ? onRetry : () => setSearch('')} /> : null}
        </View>}
      />
      <View style={ui.footer}>
        <View style={ui.summary}>
          {choice ? <Cover photo={choice.photo} small /> : null}
          <View style={ui.summaryCopy}>
            <Text style={ui.caption}>{choice ? 'Đã chọn cơ sở' : 'Bạn chưa chọn cơ sở'}</Text>
            <Text style={choice ? ui.name : ui.caption} numberOfLines={2}>{choice?.name || (facilities.length && !accepting.length ? 'Hiện chưa có cơ sở nhận đặt kho.' : 'Vui lòng chọn một cơ sở để tiếp tục.')}</Text>
          </View>
        </View>
        <View style={ui.footerAction}>
          <Action title={choice ? 'Tiếp tục chọn loại kho' : 'Tiếp tục'} arrow disabled={!canContinue}
            onPress={() => { if (choice && canContinue) onSelect(choice); }} />
        </View>
      </View>
    </>}
  </View>;
}

function Cover({ photo, small = false, detail = false }: { photo?: string | null; small?: boolean; detail?: boolean }) {
  const [failed, setFailed] = useState<string>();
  return <View style={[ui.cover, detail ? ui.detailCover : small && ui.smallCover]}>
    {typeof photo === 'string' && photo.trim() && photo !== failed
      ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" onError={() => setFailed(photo)} />
      : <Warehouse size={detail ? 76 : small ? 19 : 35} color="#2165A1" strokeWidth={1.6} />}
  </View>;
}

function Status({ available }: { available: boolean }) {
  return <View style={[ui.badge, !available && ui.pausedBadge]}>{available && <Check size={12} color="#067A3A" strokeWidth={3} />}
    <Text style={[ui.badgeText, !available && ui.pausedText]}>{available ? 'Đang nhận đặt kho' : 'Tạm dừng nhận đặt kho'}</Text></View>;
}

function Fact({ kind, value }: { kind: 'address' | 'hours'; value: string }) {
  const Icon = kind === 'address' ? MapPin : Clock3;
  return <View style={ui.fact}><Icon size={15} color={muted} /><Text style={ui.factText}>{value}</Text></View>;
}

function Action({ title, onPress, arrow, disabled }: { title: string; onPress: () => void; arrow?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [ui.action, disabled && ui.disabled, pressed && { opacity: 0.88 }]}>
    <Text style={[ui.actionText, disabled && ui.disabledText]}>{title}</Text>
    {arrow && <ArrowRight size={18} color={disabled ? muted : 'white'} />}
  </Pressable>;
}

const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF' },
  list: { paddingHorizontal: 15, paddingTop: 13, paddingBottom: 18, gap: 8 },
  intro: { gap: 13 },
  link: { color: blue, fontWeight: '700' },
  hero: { minHeight: 79, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroCopy: { flex: 1, gap: 3 },
  heroTitle: { fontSize: 25, fontWeight: '800', color: navy, letterSpacing: -0.6 },
  secondary: { color: muted, fontSize: 14, lineHeight: 20 },
  illustration: { width: 82, height: 65, borderRadius: 27, backgroundColor: '#E5F3FF', alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', left: 3, bottom: 8 },
  search: { minHeight: 47, borderWidth: 1, borderColor: border, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, gap: 8 },
  input: { color: navy, fontSize: 14, flex: 1, paddingVertical: 11 },
  clear: { width: 43, height: 44, alignItems: 'center', justifyContent: 'center' },
  section: { color: navy, fontSize: 18, fontWeight: '800', marginTop: 3, marginBottom: 1 },
  card: { borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: 'white', paddingHorizontal: 11, paddingTop: 11 },
  selected: { borderColor: blue, backgroundColor: '#EDF6FF' },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cover: { width: 81, height: 68, borderRadius: 10, backgroundColor: '#DCEEFE', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  smallCover: { width: 36, height: 35, borderRadius: 7 },
  cardCopy: { flex: 1, alignItems: 'flex-start', gap: 4 },
  name: { color: navy, fontWeight: '800', fontSize: 15 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#D6F5E4', alignSelf: 'flex-start' },
  badgeText: { color: '#067A3A', fontSize: 11, fontWeight: '700' },
  pausedBadge: { backgroundColor: '#EDF2F8' },
  pausedText: { color: muted },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  factText: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: navy },
  radio: { width: 22, height: 22, borderRadius: 12, borderWidth: 1.5, borderColor: '#BBC8D5', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: blue, borderColor: blue },
  detailsLink: { alignSelf: 'flex-end', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3 },
  detail: { padding: 16, gap: 13 },
  detailCover: { width: '100%', height: 150, borderRadius: 15 },
  skeletons: { gap: 8 },
  skeleton: { height: 112, borderRadius: 14, backgroundColor: '#EDF2F8' },
  empty: { borderRadius: 14, backgroundColor: '#F6F9FD', padding: 16, gap: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 1, borderColor: '#E5ECF3', borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: 'white', boxShadow: '0 -4px 18px #10274A14' },
  summary: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryCopy: { flex: 1, gap: 3 },
  caption: { color: muted, fontSize: 11, fontWeight: '600' },
  footerAction: { flex: 1.15 },
  action: { minHeight: 46, borderRadius: 12, backgroundColor: blue, flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8, gap: 4, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: 'white', fontSize: 13, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  disabled: { backgroundColor: '#E7EDF4' },
  disabledText: { color: muted },
});

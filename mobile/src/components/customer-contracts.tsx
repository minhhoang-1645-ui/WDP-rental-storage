import { useState } from 'react';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, ChevronDown, ChevronRight, FileText, Warehouse } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, type Row } from '@/operations/model';
import { useCustomerRentalJourney } from '@/hooks/use-customer-rental-journey';
import { JourneyScreen } from './customer-journey-ui';
import { StatusBadge } from './customer-ui';
import { EmptyState, LoadingState, ErrorState } from './screen-state';
import { formatDate, formatMoney } from '@/utils/format';
import { CustomerRenewalDocuments } from './contract-renewal-history';
import { CustomerTheme as C } from '@/constants/wdp-theme';

const blue = '#0758DC';
const contractStatusText = (status: string) => status === 'PENDING_PAYMENT' ? 'Chờ hoàn tất hồ sơ' : status === 'ACTIVE' ? 'Đang hiệu lực' : undefined;
export function contractAmount(value: unknown) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return '';
  const amount = Number(value);
  return Number.isFinite(amount) ? formatMoney(amount) : '';
}
export const canSignContract = (row: Row) => !text(row, 'terms.acceptedAt') &&
  Boolean(text(row, 'terms.snapshotHash')) && ['PENDING_PAYMENT', 'READY_FOR_HANDOVER'].includes(String(row.status)) &&
  !['EXPIRED', 'CANCELLED', 'REJECTED'].includes(text(row, 'reservation.status'));

function ContractSignatureStatus({ signed }: { signed: boolean }) {
  return <View style={[s.signatureBadge, signed ? s.signedBadge : s.unsignedBadge]}>
    <Text numberOfLines={1} style={[s.signatureLabel, { color: signed ? C.success : C.warning }]}>
      {signed ? 'Đã\u00a0ký' : 'Chưa\u00a0ký'}
    </Text>
  </View>;
}

function ContractList() {
  const { reservationId } = useLocalSearchParams<{ reservationId?: string }>();

  const source = useResource<Row>('/customer/contracts', true);
  const contracts = rows(source.data?.items).filter(row => !reservationId ||
    [text(row, 'reservation.id'), text(row, 'reservation.reference')].includes(reservationId))
    .sort((a, b) => Number(canSignContract(b)) - Number(canSignContract(a)));
  return <ScrollView style={s.screen} contentContainerStyle={s.list}
    refreshControl={<RefreshControl refreshing={source.loading} onRefresh={source.refresh} />}>
    <Stack.Screen options={{ title: 'Hợp đồng', headerTitleAlign: 'center' }} />
    {source.error ? <ErrorState message={source.error} onRetry={source.refresh} /> : source.loading && !source.data
      ? <LoadingState layout="list" /> : <>
        {contracts.length === 0 ? <EmptyState title="Chưa có hợp đồng" message={reservationId ? 'Hợp đồng của đơn đặt này sẽ xuất hiện khi được phát hành.' : 'Hợp đồng sẽ xuất hiện sau khi đơn đặt kho được xác nhận.'} /> : contracts.map(row => {
          const signed = Boolean(text(row, 'terms.acceptedAt'));
          const status = text(row, 'status');
          return <Pressable key={idOf(row)} accessibilityRole="button" style={s.row}
            onPress={() => router.push(('/customer/contracts/' + encodeURIComponent(idOf(row))) as Href)}>
            <Warehouse size={22} color={blue} />
            <View style={s.grow}>
              <Text style={s.bold}>{text(row, 'storageType.name', 'storageUnit.unitCode') || 'Kho thuê'}</Text>
              <Text style={s.muted}>{[text(row, 'contractCode'), text(row, 'storageUnit.unitCode')].filter(Boolean).join(' · ')}</Text>
              <View style={s.inline}><CalendarDays size={13} color="#475569" />
                <Text style={[s.muted, s.grow]}>{formatDate(text(row, 'startDate'))} – {formatDate(text(row, 'endDate'))}</Text>
              </View>
              <View style={s.statuses}>
                <StatusBadge status={status} displayLabel={contractStatusText(status)} />
                <ContractSignatureStatus signed={signed} />
              </View>
            </View>
            <ChevronRight size={16} color="#475569" />
          </Pressable>;
        })}
      </>}
  </ScrollView>;
}

function ContractDetail({ id }: { id: string }) {
  const detailPath = '/customer/contracts/' + encodeURIComponent(id);
  // The detail endpoint returns a single contract. Only the list uses pagination.
  const source = useResource<Row>(detailPath, false);
  const row = source.data;
  const [showAppendices, setShowAppendices] = useState(false);
  const reservationId = text(row ?? {}, 'reservation.id');
  const flow = useCustomerRentalJourney(reservationId);
  const signed = Boolean(text(row ?? {}, 'terms.acceptedAt'));
  const status = text(row ?? {}, 'status');
  const document = '/customer/contract-document?id=' + encodeURIComponent(id);
  const signable = row && canSignContract(row) && !flow.closed && !flow.loading && !flow.error;
  const monthly = contractAmount(row && text(row, 'terms.document.pricing.monthlyUnitPrice'));
  const deposit = contractAmount(row && text(row, 'terms.document.pricing.depositAmount'));
  const quantity = text(row ?? {}, 'terms.document.quantity');
  const appendices = rows(row?.renewals).filter(renewal => renewal.status === 'COMPLETED' && text(renewal, 'id'));
  const next = !flow.closed && !flow.error && !flow.loading && signed
    ? status === 'PENDING_PAYMENT' && flow.next?.path.startsWith('/customer/invoices/')
      ? { title: 'Xem hóa đơn', path: flow.next.path }
      : status === 'READY_FOR_HANDOVER' && flow.next?.path.startsWith('/customer/appointments') ? flow.next : undefined
    : undefined;
  return <JourneyScreen title="Hợp đồng thuê" action={source.error ? undefined : signable ? { title: 'Xem hợp đồng', path: document } : next}>
    {source.error ? <ErrorState message={source.error} onRetry={source.refresh} /> : !row
      ? source.loading ? <LoadingState layout="detail" /> : <EmptyState title="Không tìm thấy hợp đồng" message="Quay lại danh sách để chọn hợp đồng." /> : <>
        <Text accessibilityRole="header" style={s.title}>{text(row, 'storageType.name') || 'Kho thuê'}</Text>
        <Text selectable style={s.muted}>{[text(row, 'contractCode'), text(row, 'storageUnit.unitCode')].filter(Boolean).join(' · ')}</Text>
        <View style={s.statuses}>
          <StatusBadge status={status} displayLabel={contractStatusText(status)} />
          <ContractSignatureStatus signed={signed} />
        </View>
        <View style={{ gap: 10 }}>
          <Text style={s.bold}>Thông tin kỳ thuê</Text>
          <View style={s.inline}>{[['Từ ngày', 'startDate'], ['Đến ngày', 'endDate']].map(([label, field]) =>
            <View key={field} style={s.grow}><Text style={s.muted}>{label}</Text><Text style={s.bold}>{formatDate(text(row, field))}</Text></View>)}</View>
          {monthly ? <Text style={s.muted}>Giá thuê mỗi kho / tháng · {monthly}</Text> : null}
          {deposit ? <Text style={s.muted}>{Number(quantity) > 1 ? 'Tiền cọc của đơn đặt' : 'Tiền cọc'} · {deposit}</Text> : null}
        </View>
        {!signable && <Pressable accessibilityRole="button" style={s.row} onPress={() => router.push(document as Href)}>
          <FileText size={21} color={blue} /><View style={s.grow}><Text style={s.bold}>Xem hợp đồng</Text>
            <Text style={s.muted}>Xem nội dung trong ứng dụng</Text>
          </View><ChevronRight size={17} color="#475569" />
        </Pressable>}
        {appendices.length > 1 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAppendices }}
          style={s.row} onPress={() => setShowAppendices(value => !value)}>
          <Text style={[s.bold, s.grow]}>Phụ lục gia hạn ({appendices.length})</Text>
          {showAppendices ? <ChevronDown size={17} color={C.muted} /> : <ChevronRight size={17} color={C.muted} />}
        </Pressable>}
        {(appendices.length === 1 || showAppendices) && <CustomerRenewalDocuments contract={row} />}
        {flow.error ? <ErrorState message="Chưa tải được tiến độ của đơn đặt kho." onRetry={flow.refresh} /> : null}
        {signed && status === 'PENDING_PAYMENT' && !flow.loading && !flow.error && !flow.closed
          ? <Text style={s.muted}>{flow.allSigned ? flow.pending ? 'Khoản thanh toán đang được kiểm tra.' : 'Xem hóa đơn ban đầu để theo dõi thanh toán.' : 'Cần ký đủ hợp đồng của đơn đặt trước khi thanh toán hóa đơn ban đầu.'}</Text> : null}
      </>}
  </JourneyScreen>;
}

export function CustomerContracts({ contractId }: { contractId?: string }) {
  return contractId ? <ContractDetail id={contractId} /> : <ContractList />;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  list: { padding: 16, gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, minHeight: 58, borderWidth: 1, borderColor: '#DCE3ED', borderRadius: 12 },
  grow: { flex: 1, minWidth: 0, gap: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 23, fontWeight: '800', color: '#101828' },
  bold: { fontWeight: '700', fontSize: 15, color: '#101828' },
  muted: { fontSize: 13, color: '#475569' },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  signatureBadge: { flexShrink: 0, alignSelf: 'center', minWidth: 68, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  signedBadge: { backgroundColor: C.successBackground },
  unsignedBadge: { backgroundColor: C.warningBackground },
  signatureLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
});

import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { StorageUnitCard, SectionHeader } from '@/components/customer-ui';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { idOf, rows, text, type Row } from '@/operations/model';
import { Button, Disclosure, Navigation, styles } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';

export default function CustomerRentalsScreen() {
  const rentals = useResource<{ items: Row[]; total: number }>('/customer/rentals', true);
  const items = rentals.data?.items ?? [];
  const opening = rentals.loading && !rentals.data;
  return <ScrollView
    contentInsetAdjustmentBehavior="automatic"
    keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={rentals.loading && Boolean(rentals.data)} onRefresh={rentals.refresh} tintColor="#187D78" />}
    contentContainerStyle={styles.page}
  >
    <PageHeader eyebrow="Kho của tôi" title="Kho đang thuê" description="Theo dõi thời hạn thuê, vị trí kho và các việc cần làm cho từng kỳ thuê." />
    <Button title={rentals.loading ? 'Đang cập nhật…' : 'Làm mới'} onPress={rentals.refresh} disabled={rentals.loading} />
    {opening ? <LoadingState layout="list" label="Đang tải kho đang thuê…" /> : rentals.error ? <ErrorState message={rentals.error} onRetry={rentals.refresh} /> : items.length ? <>
      <SectionHeader title={`${items.length} kỳ thuê đang theo dõi`} />
      <View style={{ gap: 12 }}>{items.map(rental => <View key={idOf(rental)} style={{ gap: 8 }}>
        <StorageUnitCard rental={rental} onPress={() => router.push(`/customer/rentals/${encodeURIComponent(idOf(rental))}`)} />
        <Disclosure title="Hóa đơn và hợp đồng"><RentalDocuments rental={rental} /></Disclosure>
      </View>)}</View>
      <Navigation title="Hàng đang lưu" description="Xem số lượng hàng đã được ghi nhận theo hợp đồng." path="/customer/stored-items" />
      <Navigation title="Nhập – xuất hàng" description="Gửi yêu cầu đưa hàng vào hoặc lấy hàng ra kho." path="/customer/stock-movements" />
      <Navigation title="Sơ đồ vị trí kho" description="Xem sơ đồ khi cơ sở đã cung cấp dữ liệu vị trí được xác minh." path="/customer/floor-plan" />
    </> : <>
      <EmptyState title="Bạn chưa có kho đang thuê" message="Khi hoàn tất bàn giao, kho và hợp đồng hoạt động sẽ hiển thị tại đây." />
      <Navigation title="Theo dõi yêu cầu đặt kho" description="Kiểm tra tiến độ yêu cầu hiện có của bạn." path="/customer/reservations" />
      <Text style={styles.copy}>Bạn có thể chọn kho và gửi yêu cầu mới ngay trong ứng dụng.</Text><Navigation title="Tìm kho và đặt thuê" path="/customer/discover" />
    </>}
  </ScrollView>;
}

function RentalDocuments({ rental }: { rental: Row }) {
  const invoices = useResource<Row>('/customer/invoices', true);
  const reference = text(rental, 'reservationReference');
  const reservationId = text(rental, 'reservationId');
  const related = rows(invoices.data?.items).filter(invoice =>
    (reservationId && text(invoice, 'reservation.id') === reservationId) ||
    (reference && text(invoice, 'reservation.reference') === reference),
  );

  return <>
    {rows(rental.contracts).map(contract => <Navigation key={idOf(contract)} compact
      title={`Hợp đồng · ${text(contract, 'unit.unitCode', 'contractCode')}`}
      path={`/customer/contracts/${encodeURIComponent(idOf(contract))}`} />)}
    {invoices.loading ? <LoadingState layout="compact" /> : invoices.error ? <ErrorState message={invoices.error} onRetry={invoices.refresh} /> : related.length
      ? related.map(invoice => <Navigation key={idOf(invoice)} compact
        title={`Hóa đơn · ${text(invoice, 'invoiceCode')}`}
        path={`/customer/invoices/${encodeURIComponent(idOf(invoice))}`} />)
      : <Text style={styles.copy}>Kỳ thuê này chưa có hóa đơn.</Text>}
  </>;
}

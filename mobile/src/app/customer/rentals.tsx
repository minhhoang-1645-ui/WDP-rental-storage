import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { StorageUnitCard, SectionHeader } from '@/components/customer-ui';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { idOf, type Row } from '@/operations/model';
import { Button, Navigation, styles } from '@/operations/ui';
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
    {opening ? <LoadingState label="Đang tải kho đang thuê…" /> : rentals.error ? <ErrorState message={rentals.error} onRetry={rentals.refresh} /> : items.length ? <>
      <SectionHeader title={`${items.length} kỳ thuê đang theo dõi`} />
      <View style={{ gap: 12 }}>{items.map(rental => <StorageUnitCard key={idOf(rental)} rental={rental} onPress={() => router.push(`/customer/rentals/${encodeURIComponent(idOf(rental))}`)} />)}</View>
      <Navigation title="Hàng đang lưu" description="Xem số lượng hàng đã được ghi nhận theo hợp đồng." path="/customer/stored-items" />
      <Navigation title="Nhập – xuất hàng" description="Gửi yêu cầu đưa hàng vào hoặc lấy hàng ra kho." path="/customer/stock-movements" />
      <Navigation title="Sơ đồ vị trí kho" description="Xem sơ đồ khi cơ sở đã cung cấp dữ liệu vị trí được xác minh." path="/customer/floor-plan" />
    </> : <>
      <EmptyState title="Bạn chưa có kho đang thuê" message="Khi hoàn tất bàn giao, kho và hợp đồng hoạt động sẽ hiển thị tại đây." />
      <Navigation title="Theo dõi yêu cầu đặt kho" description="Kiểm tra tiến độ yêu cầu hiện có của bạn." path="/customer/reservations" />
      <Text style={styles.copy}>Để bắt đầu thuê mới, hãy chọn loại kho và gửi yêu cầu trên website WDP.</Text>
    </>}
  </ScrollView>;
}

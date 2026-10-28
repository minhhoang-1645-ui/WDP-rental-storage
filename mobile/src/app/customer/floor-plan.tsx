import { ScrollView, Text } from 'react-native';

import { FloorPlanViewer } from '@/components/floor-plan-viewer';
import { PageHeader } from '@/components/page-header';
import { Panel, styles } from '@/operations/ui';

export default function FloorPlanScreen() {
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Vị trí kho" title="Sơ đồ mặt bằng" description="Sơ đồ chỉ hiển thị khi WDP cung cấp toạ độ unit đã kiểm chứng cho cơ sở." /><FloorPlanViewer units={[]} /><Panel title="Dữ liệu chưa có sẵn"><Text style={styles.copy}>API hiện trả mã kho, tầng và khu vực sau khi phân bổ, nhưng chưa trả facility, tầng, toạ độ, lối đi hoặc trạng thái unit theo ngày. Vì vậy ứng dụng không dựng sơ đồ hoặc chọn kho chính xác để tránh hiển thị thông tin không đúng thực tế.</Text></Panel></ScrollView>;
}

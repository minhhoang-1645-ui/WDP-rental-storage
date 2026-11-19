import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { DocumentAcceptance } from '@/components/document-acceptance';
import { JourneyScreen } from '@/components/customer-journey-ui';
import { StatusBadge } from '@/components/customer-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { text, type Row } from '@/operations/model';
import { Facts, Panel } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';
import { formatDate } from '@/utils/format';

function TransferOrder({ id }: { id: string }) {
  const source = useResource<Row>('/customer/transfer-orders/' + encodeURIComponent(id));
  const row = source.data;
  const status = text(row ?? {}, 'status');
  const accepted = text(row ?? {}, 'commercial.acceptedAt');
  const from = text(row ?? {}, 'fromUnit.unitCode');
  const to = text(row ?? {}, 'toUnit.unitCode');
  return <JourneyScreen title="Phụ lục chuyển kho">
    {source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
      : source.loading ? <LoadingState layout="detail" />
        : row ? <>
          <Panel title="Thông tin chuyển kho">
            <StatusBadge status={status} />
            <Facts values={[
              ['Kho hiện tại', from],
              ['Kho mới', to],
              ['Ngày duyệt', text(row, 'approvedAt') ? formatDate(text(row, 'approvedAt')) : ''],
            ]} />
          </Panel>
          {status === 'APPROVED' || accepted ? <DocumentAcceptance row={row} resource="transfer-orders" onSaved={source.refresh} />
            : <Text>Phụ lục chưa khả dụng để ký.</Text>}
        </> : <EmptyState title="Không tìm thấy phụ lục chuyển kho" message="" />}
  </JourneyScreen>;
}

export default function CustomerTransferOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  return orderId ? <TransferOrder key={orderId} id={orderId} />
    : <JourneyScreen title="Phụ lục chuyển kho"><EmptyState title="Không tìm thấy phụ lục chuyển kho" message="" /></JourneyScreen>;
}

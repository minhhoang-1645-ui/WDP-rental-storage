import { ScrollView } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { portalResource } from '@/portals/resources';
import { useResource } from '@/operations/use-resource';
import { RecordView } from '@/operations/record-view';
import type { Row } from '@/operations/model';
import { ErrorState, LoadingState, EmptyState } from '@/components/screen-state';
import { customerStyles } from '@/components/customer-premium';

export default function CustomerRecordInformation() {
  const {resource,id}=useLocalSearchParams<{resource:string;id:string}>();
  const config=portalResource('STORAGE_CUSTOMER',String(resource));
  const source=useResource<Row>(config&&id?config.path+'/'+encodeURIComponent(String(id)):null);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={customerStyles.page}><Stack.Screen options={{title:'Thông tin đầy đủ'}}/>{!config?<EmptyState title="Không tìm thấy hồ sơ" message="Quay lại và mở hồ sơ từ danh sách của bạn."/>:source.loading?<LoadingState layout="detail"/>:source.error?<ErrorState message={source.error} onRetry={source.refresh}/>:source.data?<RecordView row={source.data} root="/customer"/>:null}</ScrollView>;
}

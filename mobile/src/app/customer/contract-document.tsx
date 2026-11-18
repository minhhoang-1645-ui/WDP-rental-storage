import { useCustomerRentalJourney } from '@/hooks/use-customer-rental-journey';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { useResource } from '@/operations/use-resource';
import { text, type Row } from '@/operations/model';
import { JourneyScreen } from '@/components/customer-journey-ui';
import { DocumentFile } from '@/components/document-file';
import { customerStyles as s } from '@/components/customer-premium';
import { LoadingState, ErrorState } from '@/components/screen-state';

export default function ContractDocument(){const {id}=useLocalSearchParams<{id:string}>();const source=useResource<Row>(id?'/customer/contracts/'+encodeURIComponent(id):null);const row=source.data;const flow=useCustomerRentalJourney(text(row??{},'reservation.id'));return <JourneyScreen title="Đọc hợp đồng" action={!flow.closed&&!flow.loading&&!flow.error&&row&&['PENDING_PAYMENT','READY_FOR_HANDOVER'].includes(String(row.status))&&!text(row,'terms.acceptedAt')?{title:'Ký hợp đồng',path:'/customer/contract-sign?id='+encodeURIComponent(id)}:undefined}>{source.loading?<LoadingState layout="detail"/>:source.error?<ErrorState message={source.error} onRetry={source.refresh}/>:row?<><Text style={s.section}>{text(row,'storageType.name')||'Hợp đồng thuê kho'}</Text><DocumentFile path={'/customer/documents/contracts/'+encodeURIComponent(id)} name={text(row,'contractCode')} title="Mở nội dung hợp đồng PDF" subtitle="Tài liệu thật từ NestBox · Xem, lưu hoặc chia sẻ"/><Text style={s.secondary}>Đọc tài liệu trong ứng dụng PDF của thiết bị trước khi ký. Bản dự thảo được đánh dấu trong tài liệu nếu thông tin phát hành chưa hoàn tất.</Text></>:null}</JourneyScreen>;}

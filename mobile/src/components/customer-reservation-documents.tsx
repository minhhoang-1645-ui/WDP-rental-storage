import { Text, View } from 'react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, label, rows, text, type Row } from '@/operations/model';
import { Navigation, styles } from '@/operations/ui';
import { ErrorState, LoadingState } from './screen-state';

/** Only links to contracts returned by the authenticated Customer endpoint. */
export function CustomerReservationDocuments({reservation}: {reservation: Row}) {
  const source=useResource<Row>('/customer/contracts',true);
  const references=new Set([idOf(reservation),text(reservation,'reference'),text(reservation,'id')].filter(Boolean));
  const items=rows(source.data?.items).filter(contract=>references.has(text(contract,'reservation.id'))||references.has(text(contract,'reservation.reference')));
  return <View style={{gap:8}}><Text accessibilityRole="header" style={{fontSize:17,fontWeight:'600',color:'#17191D'}}>Hợp đồng của đơn này</Text>{source.loading?<LoadingState layout="compact"/>:source.error?<ErrorState message={source.error} onRetry={source.refresh}/>:items.length?items.map(contract=><Navigation compact key={idOf(contract)} title={'Hợp đồng'+(text(contract,'unit.unitCode')?' · Kho '+text(contract,'unit.unitCode'):'')} description={[text(contract,'contractCode'),label(contract.status)].filter(Boolean).join(' · ')} path={'/customer/contracts/'+encodeURIComponent(idOf(contract))}/>):<Text style={styles.copy}>Hợp đồng chưa sẵn sàng. Bạn có thể cập nhật lại đơn sau.</Text>}</View>;
}

import { isEarlyReturnRequest } from '@/utils/early-return';
import { recordMatches } from '@/utils/record-search';
import { OperationForm, type FormAction } from './form';
import { assignmentAction } from './actions';
import { useAuth } from '@/auth/use-auth';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, Switch, Text, View } from 'react-native';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { codeOf, idOf, label, rows, text, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Disclosure, Field, Navigation, styles } from './ui';
import { UnitStaffAssignments } from './unit-staff';
import { assignmentNeedsAttention, assignmentWorkRank } from '@/utils/work-queue';

export function ManagerAssignments() {
  const params = useLocalSearchParams<{ search?: string; kind?: string; assignment?: string }>();
  const { user } = useAuth();
  const allowed = user?.role === 'MANAGER';
  const support = useResource<Row>(allowed ? '/manager/support-requests' : null, true);
  const maintenance = useResource<Row>(allowed ? '/manager/maintenance' : null, true);
  const movements = useResource<Row>(allowed ? '/manager/stock-movements' : null, true);
  const appointments = useResource<Row>(allowed ? '/manager/appointments' : null, true);
  const [action, setAction] = useState<FormAction>();
  const [search, setSearch] = useState(params.search ?? ''), [kind, setKind] = useState(params.kind ?? ''), [assignment, setAssignment] = useState(params.assignment ?? ''), [history, setHistory] = useState(false);
  const loading = support.loading || maintenance.loading || movements.loading || appointments.loading, error = support.error || maintenance.error || movements.error || appointments.error;
  const refresh = () => { support.refresh(); maintenance.refresh(); movements.refresh(); appointments.refresh(); };
  const tasks: Row[] = [
    ...rows(appointments.data?.items).map(row => ({ ...row, resource: 'appointments' })),
    ...rows(movements.data?.items).map(row => ({ ...row, resource: 'stock-movements' })),
    ...rows(support.data?.items).filter(row => !isEarlyReturnRequest(row)).map(row => ({ ...row, resource: 'support-requests' })),
    ...rows(maintenance.data?.items).map(row => ({ ...row, resource: 'maintenance' })),
  ].filter(row => (history || !['RESOLVED', 'COMPLETED', 'CANCELLED'].includes(text(row, 'status')))
    && (!kind || row.resource === kind)
    && (!assignment || (assignment === 'attention' ? assignmentNeedsAttention(text(row, 'resource'), row) : Boolean(text(row, 'assignedStaff.id')) === (assignment === 'assigned')))
    && recordMatches(row, search));
  tasks.sort((a, b) => assignmentWorkRank(a) - assignmentWorkRank(b) || (Date.parse(text(a, 'requestedAt', 'createdAt')) || 0) - (Date.parse(text(b, 'requestedAt', 'createdAt')) || 0));
  if (!allowed) return <View style={styles.page}><EmptyState title="Phân công thuộc khu vực quản lý" message="Mở đúng khu vực theo tài khoản của bạn." /><Navigation title="Về tổng quan" path="/manager" /></View>;
  return <FlatList keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}
    data={loading || error ? [] : tasks} keyExtractor={row => `${row.resource}:${idOf(row)}`}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <PageHeader eyebrow="Quản lý" title="Phân công nhân viên" onRefresh={refresh} description="Chọn người phụ trách theo kho hoặc giao thủ công từng hồ sơ hỗ trợ, bảo trì, nhập – xuất và lịch bàn giao." />
      <Disclosure title="Phân công nhân viên phụ trách từng kho"><UnitStaffAssignments onSaved={refresh} /></Disclosure>
      {action && <OperationForm key={action.path} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); refresh(); }} />}
      <Field title="Tìm công việc, kho hoặc nhân viên" value={search} onChange={setSearch} maxLength={120} />
      <Disclosure title="Lọc công việc">
        <CompactFilter title="Loại công việc" value={kind} onChange={setKind} options={[["","Tất cả"],["appointments","Bàn giao"],["support-requests","Hỗ trợ"],["maintenance","Bảo trì"],["stock-movements","Nhập – xuất"]]}/>
        <CompactFilter title="Phân công" value={assignment} onChange={setAssignment} options={[["","Tất cả"],["assigned","Đã giao"],["unassigned","Chưa giao"],["attention","Cần phân công"]]}/>
        <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><Text style={styles.copy}>Bao gồm lịch sử</Text><Switch value={history} onValueChange={setHistory}/></View>
      </Disclosure>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <Text style={styles.copy}>{tasks.length} công việc phù hợp</Text>}
    </View>}
    renderItem={({ item }) => <View style={[styles.card,{padding:16,gap:8,marginTop:12}]}><Text style={styles.title}>{codeOf(item)}</Text><Text style={styles.copy}>{label(item.status)} · {text(item, 'assignedStaff.fullName') || 'Chưa phân công'}</Text><Text style={styles.copy}>{text(item, 'subject', 'description', 'unit.unitCode', 'rentalContract.contractCode')}</Text>{text(item, 'assignedStaff.accountStatus') === 'DISABLED' && <Text style={styles.error}>Tài khoản phụ trách đã vô hiệu hóa; cần đổi người.</Text>}{!['COMPLETED','RESOLVED','CANCELLED'].includes(text(item, 'status')) && <Button title={text(item, 'assignedStaff.id') ? 'Đổi người' : 'Phân công nhân viên'} onPress={() => setAction(assignmentAction(text(item, 'resource'), item))} />}</View>}

    ListEmptyComponent={!loading && !error ? <EmptyState title="Không có công việc phù hợp" message="Thử đổi bộ lọc hoặc xem cả lịch sử." /> : undefined} />;
}

function CompactFilter({title,value,onChange,options}:{title:string;value:string;onChange:(value:string)=>void;options:string[][]}) {
 const [open,setOpen]=useState(false);
 return <View style={{gap:6,paddingVertical:4}}><Pressable accessibilityRole="button" onPress={()=>setOpen(!open)} style={{paddingVertical:12,flexDirection:"row",justifyContent:"space-between"}}><Text style={styles.copy}>{title}</Text><Text style={{color:"#1956C8",fontWeight:"600"}}>{options.find(x=>x[0]===value)?.[1]} ▾</Text></Pressable>{open&&<View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{options.map(([key,label])=><Pressable key={key} onPress={()=>{onChange(key);setOpen(false);}} style={{paddingHorizontal:12,paddingVertical:10,borderRadius:20,backgroundColor:value===key?"#EAF1FF":"#F3F4F6"}}><Text style={{color:value===key?"#1956C8":"#374151"}}>{label}</Text></Pressable>)}</View>}</View>;
}

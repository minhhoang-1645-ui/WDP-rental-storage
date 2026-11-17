import { Alert, Modal, KeyboardAvoidingView, Platform, ScrollView, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { OperationForm, type FormAction } from '@/operations/form';
import type { Row } from '@/operations/model';
import { customerStyles as s } from './customer-premium';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { useState } from 'react';
import { RentalCalendar } from './rental-calendar';
import { Field } from '@/operations/ui';
import { formatDate } from '@/utils/format';

function CustomerActionForm({action,onClose,onSaved,onBusyChange}:{action:FormAction;onClose:()=>void;onSaved:(result:Row)=>void;onBusyChange:(busy:boolean)=>void}) {
  const [date,setDate]=useState(''),[time,setTime]=useState('');
  const appointment=action.fields.some(field=>field.name==='scheduledAt');
  const scheduledAt=date&&time?date+' '+time:'';
  const prepared:FormAction=appointment?{...action,description:'Chọn giờ Việt Nam. Có thể nhận chìa khóa sớm tối đa 3 ngày trước kỳ thuê, trước ngày kết thúc. Bạn chỉ được sử dụng kho từ ngày bắt đầu thuê.',fields:action.fields.filter(field=>field.name!=='scheduledAt'),validateValues:input=>!date?'Chọn ngày nhận kho.':!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?'Nhập giờ nhận kho theo dạng 10:30.':action.validateValues?.({...input,scheduledAt}),transform:input=>action.transform?action.transform({...input,scheduledAt}):({...input,scheduledAt})}:action;
  const customerAction={...prepared,fields:prepared.fields.map(field=>field.name==='paymentPlan'?{...field,choices:field.choices?.map(choice=>({...choice,label:choice.value==='PREPAID'?'Trả thẳng':choice.value==='PAY_MONTHLY'?'Trả hàng tháng':choice.label}))}:field)};
  return <View style={{gap:12}}>{appointment&&<><Text style={s.title}>Ngày giờ nhận kho</Text><RentalCalendar start={date} end="" daily={false} onChange={from=>setDate(from)}/><Text style={s.body}>{date?formatDate(date):'Chọn ngày nhận kho'}</Text><Field title="Giờ nhận kho (ví dụ 10:30)" value={time} maxLength={5} onChange={setTime}/></>}<OperationForm onBusyChange={onBusyChange} action={customerAction} onClose={onClose} onSaved={onSaved}/></View>;
}

export function CustomerRecordActions({actions,selected,onSelect,onClose,onSaved}:{actions:FormAction[];selected?:FormAction;onSelect:(action:FormAction)=>void;onClose:()=>void;onSaved:(result:Row)=>void}) {
  const [busy,setBusy]=useState(false);
  const requestClose=()=>{if(busy)return;Alert.alert('Đóng yêu cầu?','Thông tin chưa gửi sẽ không được lưu.',[{text:'Tiếp tục nhập',style:'cancel'},{text:'Đóng',style:'destructive',onPress:onClose}]);};
  return <><View style={{gap:4}}>{actions.length>0&&<Text style={s.section}>Bạn có thể thực hiện</Text>}{actions.map((action,index)=><Pressable key={action.path+action.title} accessibilityRole="button" onPress={()=>onSelect(action)} style={({pressed})=>[s.row,{backgroundColor:index===0?C.soft:'transparent',paddingHorizontal:index===0?12:0,borderRadius:index===0?12:0,opacity:pressed?0.7:1}]}><Text style={[s.body,{flex:1,fontWeight:'600',color:index===0?C.navy:C.text}]}>{action.title}</Text><ChevronRight size={18} color={C.muted}/></Pressable>)}</View><Modal visible={Boolean(selected)} animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}><SafeAreaView style={{flex:1,backgroundColor:'white'}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={s.page}>{selected&&<CustomerActionForm onBusyChange={setBusy} key={selected.path+selected.title} action={selected} onClose={onClose} onSaved={onSaved}/>}</ScrollView></KeyboardAvoidingView></SafeAreaView></Modal></>;
}

import { useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Minus, Package, Plus, ShoppingCart, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WdpColors as C } from '@/constants/wdp-theme';
import { useResource } from '@/operations/use-resource';
import { useServiceQuote } from '@/hooks/use-service-quote';
import { Button, styles } from '@/operations/ui';
import type { Row } from '@/operations/model';
import type { AdditionalService, ServiceInventory, ServiceSelection } from '@/types/additional-service';
import { defaultServiceSelection, maxServiceMonths, serviceCalendarMonths, serviceMonthEnd, serviceSelectionIssue } from '@/utils/service-period';
import { localizeService } from '@/utils/service-labels';
import { formatDate, formatMoney } from '@/utils/format';
import { DateField } from './date-field';
import { BookingTabs } from './booking-header';
import { ErrorState, LoadingState } from './screen-state';

type Props={bookingSummary?:string;services:AdditionalService[];selections:ServiceSelection[];start:string;end:string;loading:boolean;error?:string;continueError?:string;retry:()=>void;onChange:(value:ServiceSelection[])=>void;quoteInput:Row;onContinue:(skip?:boolean)=>void;busy:boolean};
function inventoryPath(service:AdditionalService,choice:ServiceSelection|null) {
  if(!choice||service.isActive===false)return null;
  const query=new URLSearchParams({...(service.facilityId?{facilityId:service.facilityId}:{}),quantity:String(choice.quantity),...(choice.serviceStartDate?{startDate:choice.serviceStartDate}:{}),...(choice.serviceEndDate?{endDate:choice.serviceEndDate}:{})});
  return '/additional-services/'+encodeURIComponent(service.id)+'/availability?'+query;
}
function durationLabel(service:AdditionalService,choice:ServiceSelection) {
  if(service.kind==='PURCHASE')return 'Thanh toán một lần';
  const value=service.billingUnit==='MONTH'?serviceCalendarMonths(choice.serviceStartDate??'',choice.serviceEndDate??''):(Date.parse(choice.serviceEndDate??'')-Date.parse(choice.serviceStartDate??''))/86400000;
  return typeof value==='number'&&Number.isFinite(value)&&value>0?value+' '+(service.billingUnit==='MONTH'?'tháng':'ngày'):'';
}
function formula(service:AdditionalService,choice:ServiceSelection) {
  if(service.unitPrice==null)return 'Chưa có giá';
  const price=formatMoney(service.unitPrice);
  const unit=service.physicalUnit?.trim()||(service.kind==='PURCHASE'?'sản phẩm':'thiết bị');
  if(service.billingUnit==='ONE_TIME')return price+'/'+unit+' × '+choice.quantity;
  const units=service.billingUnit==='MONTH'?serviceCalendarMonths(choice.serviceStartDate??'',choice.serviceEndDate??''):(Date.parse(choice.serviceEndDate??'')-Date.parse(choice.serviceStartDate??''))/86400000;
  return price+'/'+unit+'/'+(service.billingUnit==='MONTH'?'tháng':'ngày')+' × '+(Number.isFinite(units)?units:'—')+' '+(service.billingUnit==='MONTH'?'tháng':'ngày')+' × '+choice.quantity;
}
function ServiceImage({service}:{service:AdditionalService}) {
  const [failed,setFailed]=useState('');
  return service.imageUrl&&failed!==service.imageUrl?<Image source={{uri:service.imageUrl}} onError={()=>setFailed(service.imageUrl??'')} accessibilityLabel={service.imageAlt||service.name} resizeMode="contain" style={s.image}/>:<View style={[s.image,{alignItems:'center',justifyContent:'center'}]}><Package size={26} color={C.muted}/></View>;
}
function CatalogRow({service,choice,start,end,amount,onOpen,onDecrease,onIncrease,busy}:{service:AdditionalService;choice?:ServiceSelection;start:string;end:string;amount?:number;onOpen:()=>void;onDecrease:()=>void;onIncrease:()=>void;busy:boolean}) {
  const defaults=choice??defaultServiceSelection(service,start,end);
  const inventory=useResource<ServiceInventory>(inventoryPath(service,defaults));
  const active=service.isActive!==false&&Number.isSafeInteger(service.unitPrice)&&Number(service.unitPrice)>0;
  const canAdd=active&&Boolean(defaults)&&!inventory.loading&&!inventory.error&&inventory.data?.available===true;
  return <View style={[s.row,choice&&{backgroundColor:'#F5F8FE'}]}><ServiceImage service={service}/><View style={{flex:1,gap:2}}><Text style={s.name} onPress={choice&&!busy?onOpen:undefined}>{service.name}</Text><Text style={styles.copy}>{service.unitPrice==null?'Chưa có giá':formatMoney(service.unitPrice)+' / '+(service.physicalUnit || (service.kind === 'PURCHASE' ? 'sản phẩm' : 'thiết bị'))+(service.billingUnit==='ONE_TIME'?' · một lần':service.billingUnit==='DAY'?'/ngày':'/tháng')}</Text>{service.billingUnit==='MONTH'&&<Text style={styles.copy}>Tối thiểu {service.minimumRentalMonths ?? 1} tháng{!defaults?' · Kỳ thuê kho quá ngắn':''}</Text>}{choice?<><Text style={styles.copy}>{choice.quantity} {service.kind==='PURCHASE'?'sản phẩm':'thiết bị'} · {durationLabel(service,choice)}</Text>{amount!==undefined&&<Text style={s.amount}>{formatMoney(amount)}</Text>}</>:<Text style={styles.copy}>{!active?'Hiện chưa cung cấp':!defaults?'Thời gian thuê chưa phù hợp':inventory.loading?'Đang kiểm tra…':inventory.error?'Chưa kiểm tra được số lượng':inventory.data?.available!==true?'Hết chỗ trong thời gian này':typeof inventory.data.availableQuantity==='number'?'Còn '+Math.max(0,inventory.data.availableQuantity)+' '+(service.kind==='PURCHASE'?'sản phẩm':'thiết bị'):'Có thể đặt'}</Text>}{inventory.error&&<Pressable accessibilityRole="button" onPress={inventory.refresh} style={s.smallAction}><Text style={s.link}>Thử lại</Text></Pressable>}</View>{choice ? <View style={s.quantity}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Giảm '+service.name} disabled={busy} onPress={onDecrease} style={s.smallAction}><Minus size={16} color={C.navy}/></Pressable>
    <Text style={s.name}>{choice.quantity}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={'Tăng '+service.name} disabled={busy||!canAdd||choice.quantity>=Math.min(100,inventory.data?.availableQuantity??100)} onPress={onIncrease} style={s.smallAction}><Plus size={16} color={C.navy}/></Pressable>
  </View> : <Pressable accessibilityRole="button" accessibilityLabel={'Thêm '+service.name} disabled={busy||!active||!defaults} onPress={onOpen} style={[s.addAction,{opacity:active&&defaults?1:0.4}]}><Plus size={14} color="#0758DC"/><Text style={s.addLabel}>Thêm</Text></Pressable>}</View>;
}

export function ServiceCatalog(props:Props) {
  const {services,selections,start,end,loading,error,continueError,retry,onChange,quoteInput,onContinue,busy}=props;
  const insets=useSafeAreaInsets();
  const [chosenKind,setKind]=useState<'RENTAL'|'PURCHASE'>(),[cart,setCart]=useState(false);
  const kind = chosenKind ?? (services.some(item => item.kind === 'RENTAL') ? 'RENTAL' : 'PURCHASE');
  const [editing,setEditing]=useState<string>(),[editorOpen,setEditorOpen]=useState(false),[datesOpen,setDatesOpen]=useState(false);
  const [drafts,setDrafts]=useState<Record<string,ServiceSelection>>({});
  const service=services.find(item=>item.id===editing), draft=editing?drafts[editing]:undefined;
  const minimumMonths = service?.minimumRentalMonths ?? 1;
  const serviceStart = draft?.serviceStartDate ?? start;
  const maximumMonths = maxServiceMonths(serviceStart, end);
  const selectedMonths = serviceCalendarMonths(serviceStart, draft?.serviceEndDate ?? '') ?? minimumMonths;
  const defaultMonths = maxServiceMonths(start, end);
  const issue=service&&draft?serviceSelectionIssue(service,draft,start,end):'';
  const pending=service&&draft?[...selections.filter(item=>item.serviceId!==service.id),draft]:[];
  const quote=useServiceQuote(quoteInput,selections);
  const preview=useServiceQuote(quoteInput,pending,editorOpen&&!issue);
  const inventory=useResource<ServiceInventory>(editorOpen&&service&&draft&&!issue?inventoryPath(service,draft):null);
  const maximum=Math.min(100,typeof inventory.data?.availableQuantity==='number'?Math.max(0,inventory.data.availableQuantity):100);
  const valid=Boolean(service&&draft&&!issue&&!inventory.loading&&!inventory.error&&inventory.data?.available===true&&!preview.loading&&!preview.error&&preview.amount(service.id)!==undefined&&draft.quantity<=maximum);
  const open=(item:AdditionalService)=>{const initial=drafts[item.id]??selections.find(choice=>choice.serviceId===item.id)??defaultServiceSelection(item,start,end);if(!initial)return;setDrafts(previous=>({...previous,[item.id]:initial}));setEditing(item.id);setDatesOpen(false);setEditorOpen(true);};
  const patch=(value:Partial<ServiceSelection>)=>{if(editing&&draft){setDrafts(previous=>({...previous,[editing]:{...draft,...value}}));}};
  const close=()=>{setEditorOpen(false);};
  const remove=()=>{if(!service)return;onChange(selections.filter(item=>item.serviceId!==service.id));setDrafts(previous=>{const next={...previous};delete next[service.id];return next;});close();};
  const selectedService=(id:string)=>{const found=services.find(item=>item.id===id);return found?localizeService(found):undefined;};
  const total=quote.quote?.addOnTotalAmount;
  const changeQuantity=(choice:ServiceSelection,delta:number)=>{
    const next=choice.quantity+delta;
    onChange(selections.flatMap(row=>row.serviceId!==choice.serviceId?[row]:next>0?[{...row,quantity:next}]:[]));
    setDrafts(previous=>{const updated={...previous};delete updated[choice.serviceId];return updated;});
  };
  const footer=<View style={[s.footer,{paddingBottom:Math.max(12,insets.bottom)}]}>
    {selections.length>0 && <Pressable accessibilityRole="button" disabled={busy} onPress={()=>setCart(true)} style={s.cartSummary}>
      <ShoppingCart size={18} color="#0758DC"/>
      <Text style={[s.link,{flex:1}]}>Đã chọn {selections.reduce((sum,item)=>sum+item.quantity,0)} · {quote.loading?'Đang lấy giá…':typeof total==='number'?'Tạm tính '+formatMoney(total):'Xem lựa chọn'}</Text>
      <ChevronRight size={16} color="#0758DC"/>
    </Pressable>}
    {continueError ? <Text accessibilityRole="alert" style={styles.error}>{continueError}</Text> : null}
    {quote.error && selections.length>0 ? <ErrorState message={quote.error} onRetry={quote.retry}/> : null}
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
      {selections.length>0 && <Pressable accessibilityRole="button" disabled={busy} onPress={()=>onContinue(true)} style={s.smallAction}><Text style={s.link}>Bỏ qua</Text></Pressable>}
      <View style={{flex:1}}><Button title={busy?'Đang kiểm tra…':'Tiếp tục đến chi phí'} disabled={busy||(selections.length>0&&(quote.loading||Boolean(quote.error)))} onPress={()=>onContinue()}/></View>
    </View>
  </View>;
  const editorContent=<Modal visible={editorOpen} transparent animationType="slide" onRequestClose={close}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Đóng cấu hình" onPress={close} style={{flex:1}}/><View style={[s.sheet,{paddingBottom:Math.max(16,insets.bottom)}]}><View style={s.header}><Text style={[s.name,{flex:1,fontSize:18}]}>{service?localizeService(service).name:'Thiết bị'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={close} style={s.smallAction}><X color={C.text}/></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{gap:16,paddingBottom:12}}>{service&&draft&&<><Text style={styles.copy}>{service.unitPrice==null?'Chưa có giá':formatMoney(service.unitPrice)+' / '+(service.physicalUnit || (service.kind === 'PURCHASE' ? 'sản phẩm' : 'thiết bị'))+(service.billingUnit==='ONE_TIME'?' · một lần':service.billingUnit==='DAY'?'/ngày':'/tháng')}</Text><View style={s.spread}><Text style={s.name}>Số lượng</Text><View style={{flexDirection:'row',alignItems:'center',gap:16}}><Pressable accessibilityRole="button" accessibilityLabel="Giảm số lượng" disabled={draft.quantity<=1} onPress={()=>patch({quantity:draft.quantity-1})} style={s.smallAction}><Minus color={draft.quantity<=1?C.disabled:C.navy}/></Pressable><Text style={s.amount}>{draft.quantity}</Text><Pressable accessibilityRole="button" accessibilityLabel="Tăng số lượng" disabled={inventory.loading||Boolean(inventory.error)||draft.quantity>=maximum} onPress={()=>patch({quantity:Math.min(maximum,draft.quantity+1)})} style={s.smallAction}><Plus color={inventory.loading||inventory.error||draft.quantity>=maximum?C.disabled:C.navy}/></Pressable></View></View>{inventory.loading?<Text style={styles.copy}>Đang kiểm tra số lượng…</Text>:inventory.error?<ErrorState message={inventory.error} onRetry={inventory.refresh}/>:typeof inventory.data?.availableQuantity==='number'&&<Text style={styles.copy}>Còn {Math.max(0,inventory.data.availableQuantity)} {service.kind==='PURCHASE'?'sản phẩm':'thiết bị'} trong thời gian đã chọn.</Text>}{service.kind==='RENTAL'&&<><View style={s.spread}><Text style={s.name}>Thời gian sử dụng</Text><Pressable accessibilityRole="button" onPress={()=>setDatesOpen(value=>!value)} style={s.smallAction}><Text style={s.link}>{datesOpen?'Thu gọn':'Thay đổi'}</Text></Pressable></View><Text style={styles.copy}>{formatDate(draft.serviceStartDate)} → {formatDate(draft.serviceEndDate)}</Text><Text style={styles.copy}>{durationLabel(service,draft)}</Text><Text style={styles.copy}>{draft.serviceStartDate===start&&draft.serviceEndDate===end?'Dùng theo thời gian thuê kho':'Thời gian riêng trong khoảng thuê kho'}</Text>{service.billingUnit==='MONTH'&&<Text style={styles.copy}>Tối thiểu {minimumMonths} tháng · Mặc định {defaultMonths} tháng theo kỳ thuê kho.</Text>}
{datesOpen&&(service.billingUnit==='MONTH'?<View style={s.spread}><Text style={styles.copy}>{maximumMonths===minimumMonths?'Kỳ thuê kho chỉ đủ cho mức tối thiểu.':'Số tháng sử dụng'}</Text><View style={s.quantity}>
<Pressable accessibilityRole="button" accessibilityLabel="Giảm số tháng" disabled={selectedMonths<=minimumMonths} onPress={()=>patch({serviceEndDate:serviceMonthEnd(serviceStart,selectedMonths-1)})} style={s.smallAction}><Minus size={16} color={selectedMonths<=minimumMonths?C.disabled:C.navy}/></Pressable>
<Text style={s.name}>{selectedMonths}</Text>
<Pressable accessibilityRole="button" accessibilityLabel="Tăng số tháng" disabled={selectedMonths>=maximumMonths} onPress={()=>patch({serviceEndDate:serviceMonthEnd(serviceStart,selectedMonths+1)})} style={s.smallAction}><Plus size={16} color={selectedMonths>=maximumMonths?C.disabled:C.navy}/></Pressable></View></View>:<><DateField title="Dùng từ ngày" min={start} value={draft.serviceStartDate??''} onChange={value=>patch({serviceStartDate:value})}/><DateField title="Đến ngày" min={draft.serviceStartDate??start} value={draft.serviceEndDate??''} onChange={value=>patch({serviceEndDate:value})}/></>)}</>}<View style={{gap:8,borderTopWidth:1,borderColor:C.border,paddingTop:12}}><Text style={s.name}>Chi phí</Text><Text style={styles.copy}>{formula(service,draft)}</Text>{preview.loading?<Text style={styles.copy}>Đang lấy báo giá…</Text>:preview.amount(service.id)!==undefined&&<Text style={[s.amount,{fontSize:22}]}>{formatMoney(preview.amount(service.id)!)}</Text>}{preview.error&&<ErrorState message={preview.error} onRetry={preview.retry}/>}</View>{issue?<Text accessibilityRole="alert" style={styles.error}>{issue}</Text>:inventory.data?.available===false?<Text accessibilityRole="alert" style={styles.error}>Số lượng đã chọn không còn đủ. Hãy giảm số lượng hoặc đổi ngày.</Text>:null}</>}</ScrollView><Button title={selections.some(item=>item.serviceId===editing)?'Cập nhật':'Thêm vào lựa chọn'} disabled={!valid} onPress={()=>{if(!valid||!draft)return;onChange(pending);close();}}/>{selections.some(item=>item.serviceId===editing)&&<Pressable accessibilityRole="button" onPress={remove} style={[s.smallAction,{alignSelf:'center'}]}><Text style={{fontSize:14,color:C.danger,fontWeight:'600'}}>Xóa khỏi lựa chọn</Text></Pressable>}</View></KeyboardAvoidingView></Modal>;
  return <View style={{flex:1}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:8,paddingBottom:20}}><>{props.bookingSummary && <View style={s.bookingSummary}><Package size={18} color="#0758DC" /><Text style={[styles.copy,{flex:1}]}>{props.bookingSummary}</Text></View>}<Text style={styles.copy}>Không bắt buộc</Text></><BookingTabs value={kind} options={[{value:'RENTAL',label:'Thuê thiết bị'},{value:'PURCHASE',label:'Mua một lần'}]} onChange={value=>setKind(value as 'RENTAL'|'PURCHASE')}/>{loading?<LoadingState layout="list"/>:error?<ErrorState message={error} onRetry={retry}/>:!services.some(item=>item.kind===kind)?<Text style={styles.copy}>Chưa có sản phẩm trong nhóm này.</Text>:services.filter(item=>item.kind===kind).map(raw=>{const item=localizeService(raw);return <CatalogRow key={item.id} service={item} choice={selections.find(choice=>choice.serviceId===item.id)} start={start} end={end} amount={quote.amount(item.id)} onOpen={()=>open(raw)} busy={busy} onDecrease={()=>{const choice=selections.find(row=>row.serviceId===item.id);if(choice)changeQuantity(choice,-1);}} onIncrease={()=>{const choice=selections.find(row=>row.serviceId===item.id);if(choice)changeQuantity(choice,1);}}/>;})}</ScrollView>{footer}
    <Modal visible={cart} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setCart(false)}><View style={{flex:1,backgroundColor:C.surface,paddingTop:insets.top}}><View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Về danh mục" onPress={()=>setCart(false)} style={s.smallAction}><ChevronLeft color={C.text}/></Pressable><Text style={[s.name,{flex:1,fontSize:20}]}>Thiết bị đã chọn</Text></View><ScrollView contentContainerStyle={{padding:16,gap:16}}>{!selections.length&&<Text style={styles.copy}>Bạn chưa chọn thiết bị nào.</Text>}{selections.map(choice=>{const item=selectedService(choice.serviceId);return <View key={choice.serviceId} style={{gap:8,paddingBottom:16,borderBottomWidth:1,borderColor:C.border}}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={[s.name,{flex:1}]}>{item?.name??'Thiết bị không còn trong danh mục'}</Text>{item?<Pressable accessibilityRole="button" onPress={()=>open(item)} style={s.smallAction}><Text style={s.link}>Chỉnh</Text></Pressable>:<Pressable accessibilityRole="button" onPress={()=>onChange(selections.filter(row=>row.serviceId!==choice.serviceId))} style={s.smallAction}><Text style={{color:C.danger}}>Xóa</Text></Pressable>}</View><Text style={styles.copy}>{choice.quantity} {item?.kind==='PURCHASE'?'sản phẩm':'thiết bị'}</Text>{item?.kind==='RENTAL'&&<Text style={styles.copy}>{formatDate(choice.serviceStartDate)} → {formatDate(choice.serviceEndDate)}</Text>}{item&&<Text style={styles.copy}>{formula(item,choice)}</Text>}{quote.amount(choice.serviceId)!==undefined&&<Text style={s.amount}>{formatMoney(quote.amount(choice.serviceId)!)}</Text>}</View>;})}</ScrollView><View style={{padding:16,borderTopWidth:1,borderColor:C.border}}>{typeof total==='number'&&<View style={{flexDirection:'row',justifyContent:'space-between',gap:12,paddingBottom:12}}><Text style={s.name}>Tổng thiết bị và vật tư</Text><Text style={s.amount}>{formatMoney(total)}</Text></View>}<Button title={busy?'Đang kiểm tra…':'Tiếp tục xem báo giá'} disabled={busy||quote.loading||Boolean(quote.error)} onPress={()=>{setCart(false);onContinue();}}/>{quote.error&&<ErrorState message={quote.error} onRetry={quote.retry}/>}</View>{editorContent}</View></Modal>
    {!cart&&editorContent}
  </View>;
}
const s=StyleSheet.create({addAction:{flexDirection:"row",alignItems:"center",justifyContent:"center",minHeight:44,gap:2,paddingHorizontal:7},addLabel:{color:"#0758DC",fontSize:12,fontWeight:"700"},bookingSummary:{flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"#DCE3EC",borderRadius:10,padding:10},quantity:{flexDirection:'row',alignItems:'center',borderRadius:22,backgroundColor:'#EAF1FD'},cartSummary:{flexDirection:'row',alignItems:'center',gap:8,padding:10,minHeight:44,borderRadius:10,backgroundColor:'#EAF1FD'},row:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:5,paddingHorizontal:8,borderWidth:1,borderColor:C.border,borderRadius:10},image:{width:36,height:36,borderRadius:10,backgroundColor:C.surfaceSecondary},name:{fontSize:14,lineHeight:19,fontWeight:'600',color:C.text},amount:{fontSize:17,lineHeight:24,fontWeight:'700',color:C.text},link:{fontSize:14,fontWeight:'600',color:C.navy},smallAction:{minWidth:44,minHeight:44,paddingHorizontal:8,alignItems:'center',justifyContent:'center'},footer:{padding:16,gap:12,borderTopWidth:1,borderColor:C.border,backgroundColor:C.surface},header:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:8,paddingVertical:4},overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.3)',justifyContent:'flex-end'},sheet:{maxHeight:'88%',paddingHorizontal:16,paddingTop:8,gap:8,backgroundColor:C.surface,borderTopLeftRadius:20,borderTopRightRadius:20},spread:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}});

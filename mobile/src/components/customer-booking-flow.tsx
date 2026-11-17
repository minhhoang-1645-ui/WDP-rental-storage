import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ArrowRight, ChevronLeft, Info, Minus, Plus, Warehouse } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/use-auth';
import { usePublicCatalog } from '@/hooks/use-public-catalog';
import { useResource } from '@/operations/use-resource';
import { apiRequest, apiUrl, ApiError } from '@/services/api';
import { useDraftGuard } from '@/services/live-events';
import { object, rows, text, type Row } from '@/operations/model';
import { Button, Disclosure, Field, Navigation, styles } from '@/operations/ui';
import { WdpColors as C } from '@/constants/wdp-theme';
import { vietnamCalendarDate } from '@/utils/calendar-date';

import { formatDate, formatMoney } from '@/utils/format';
import { profileContactIssue } from '@/utils/profile-contact';
import { serviceSelectionIssue } from '@/utils/service-period';
import type { AdditionalService, ServiceInventory, ServiceSelection } from '@/types/additional-service';
import type { FloorPlanUnit } from './floor-plan-viewer';
import type { StorageSize } from '../../../FE/src/types/storage';
import { ServiceCatalog } from './service-catalog';
import { BookingBill } from './booking-bill';
import { CustomerChoices, CustomerReveal } from './customer-flow';
import { ErrorState, LoadingState } from './screen-state';
import { RentalCalendar } from './rental-calendar';
import { BookingUnitSelector } from './booking-unit-selector';
import StoragePreview from './storage-preview-dom';

type UnitMap = {productId: string; units: FloorPlanUnit[]};
const titles = ['Chọn loại kho','Thời gian thuê','Chọn vị trí kho','Thiết bị thêm','Chi phí & xác nhận'];
const monthEnd = (start: string, months: number) => {if(!start || !Number.isInteger(months) || months<1)return '';const date=new Date(start+'T00:00:00Z');const result=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+months,1));result.setUTCDate(Math.min(date.getUTCDate(),new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate()));return result.toISOString().slice(0,10);};

export function CustomerBookingFlow() {
  const params = useLocalSearchParams<{product?: string; size?: string; startDate?: string; endDate?: string; durationMonths?: string; periodMode?: string; unit?: string}>();
  const catalog = usePublicCatalog(), {user} = useAuth(), insets = useSafeAreaInsets();
  const products = rows(catalog.data?.products), sizes = rows(catalog.data?.sizes);
  const addons = useResource<AdditionalService[]>('/additional-services');
  const [step,setStep] = useState(1), [productChoice,setProduct] = useState(params.product ?? '');
  const product = products.find(row => text(row,'id') === productChoice) ?? products.find(row => row.sizeId === params.size) ?? products[0];
  const productId = text(product ?? {},'id'), size = sizes.find(row => row.id === product?.sizeId);
  const supported = Array.isArray(catalog.data?.approvedDurations) ? (catalog.data.approvedDurations as unknown[]).map(Number).filter(n => [1,3,6,12].includes(n)) : [1,3,6,12];
  const durations = Array.from({length: Math.max(...(supported.length?supported:[12]))},(_,index)=>index+1);
  const [mode,setMode] = useState<'duration'|'dates'>(params.periodMode === 'dates' ? 'dates' : 'duration');
  const [start,setStart] = useState(params.startDate ?? ''), [dailyEnd,setEnd] = useState(params.endDate ?? '');
  const [months,setMonths] = useState(Number(params.durationMonths) || 3), [quantity,setQuantity] = useState('1');
  const [plan,setPlan] = useState<'PAY_MONTHLY'|'PREPAID'>('PAY_MONTHLY');
  const [selections,setSelections] = useState<ServiceSelection[]>([]);
  const [units,setUnits] = useState<FloorPlanUnit[]>([]), [selected,setSelected] = useState<string[]>([]);
  const [quote,setQuote] = useState<Row>(), [busy,setBusy] = useState(false), [error,setError] = useState(''), [soldOut,setSoldOut] = useState(false);
  const [floor,setFloor] = useState(''), [zone,setZone] = useState(''), [preview,setPreview] = useState(false);
  const [failedImage,setFailedImage] = useState('');
  const request = useRef<AbortController|null>(null), locked = useRef(false), version = useRef(0);
  useEffect(() => {if(catalog.data && !durations.includes(months)) setMonths(durations[0]);}, [catalog.data, months, durations.join(',')]);
  const end = mode === 'duration' ? monthEnd(start, months) : dailyEnd;
  useDraftGuard(Boolean(start || selections.length || busy));
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {const sub = BackHandler.addEventListener('hardwareBackPress', () => {if(busy)return true;if(step > 1 && !locked.current) {setStep(step - 1); return true;} return locked.current;}); return () => sub.remove();}, [step,busy]);
  const invalidate = () => {version.current++; request.current?.abort(); request.current=null; setBusy(false); setUnits([]); setSelected([]); setQuote(undefined); setError(''); setSoldOut(false);};
  const payload = (ids = selected) => ({productId, startDate:start, quantity:Number(quantity), periodMode:'dates', endDate:end, paymentPlan:plan, paymentChoice:'pay-later', adjacencyPreference:false, ...(ids.length ? {selectedUnitIds:ids} : {}), addonIds:[], services:selections});
  const validate = () => !product ? 'Chọn loại kho.' : !start || start < vietnamCalendarDate() ? 'Chọn ngày bắt đầu từ hôm nay.' : !end || end <= start ? 'Chọn ngày kết thúc sau ngày bắt đầu.' : !Number.isInteger(Number(quantity)) || Number(quantity)<1 || Number(quantity)>3 ? 'Bạn có thể đặt từ 1 đến 3 kho.' : mode === 'duration' && !durations.includes(months) ? 'Chọn thời hạn thuê được hỗ trợ.' : selections.map(selection => serviceSelectionIssue(addons.data?.find(service => service.id === selection.serviceId),selection,start,end)).find(Boolean) || '';
  async function availability(nextStep: number, revalidate = false, chosenPlan = plan) {
    if(request.current || locked.current) return;
    const issue = validate(); if(issue) {setError(issue); return;}
    const controller = new AbortController(), revision = version.current;
    request.current=controller; setBusy(true); setError(''); setSoldOut(false);
    try {
      for(const selection of selections) {
        const query = new URLSearchParams({quantity:String(selection.quantity), ...(selection.serviceStartDate ? {startDate:selection.serviceStartDate} : {}), ...(selection.serviceEndDate ? {endDate:selection.serviceEndDate} : {})});
        const inventory = await apiRequest<ServiceInventory>('/additional-services/'+encodeURIComponent(selection.serviceId)+'/availability?'+query,{signal:controller.signal});
        if(!inventory.available) throw new Error('Dịch vụ thêm không còn đủ số lượng. Hãy sửa lựa chọn dịch vụ.');
      }
      const body=JSON.stringify({...payload(revalidate ? selected : []), paymentPlan:chosenPlan});
      const result=await apiRequest<Row>('/booking/availability',{method:'POST',authenticated:false,body,signal:controller.signal});
      const map=result.available === true ? await apiRequest<UnitMap>('/booking/unit-map',{method:'POST',authenticated:false,body,signal:controller.signal}) : undefined;
      if(controller.signal.aborted || version.current !== revision) return;
      if(map && (map.productId !== productId || !Array.isArray(map.units))) throw new Error('Không thể tải các ô kho phù hợp. Vui lòng thử lại.');
      if(result.available !== true || !map?.units.some(unit=>unit.available)) {setUnits([]);setSelected([]);setQuote(undefined);setSoldOut(true);setStep(2);Alert.alert('Kho đã hết chỗ','Chưa có ô trống trong thời gian bạn chọn.',[{text:'Đổi ngày thuê'},{text:'Chọn loại kho khác',onPress:()=>setStep(1)}]);return;}
      setUnits(map.units);setQuote(object(result.quote));
      if(revalidate && selected.some(id=>!map.units.some(unit=>unit.id===id && unit.available))) {setSelected([]);setError('Ô kho này vừa được đặt. Vui lòng chọn ô khác.');setStep(3);return;}
      const first=map.units.find(unit=>selected.includes(unit.id)) ?? map.units.find(unit=>unit.available)!;
      setFloor(first.floor??'');setZone(first.zone??'');setStep(nextStep);
    } catch(caught) {if(!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Không thể kiểm tra kho lúc này.');}
    finally {if(request.current===controller) {request.current=null;setBusy(false);}}
  }
  async function submit() {
    if(locked.current || request.current || !quote || selected.length !== Number(quantity)) return;
    const issue=validate() || profileContactIssue(user?.fullName??'', user?.phone??''); if(issue) {setError(issue);return;}
    locked.current=true;setBusy(true);setError('');
    const controller=new AbortController();request.current=controller;
    try {
      const body=JSON.stringify(payload());
      const map=await apiRequest<UnitMap>('/booking/unit-map',{method:'POST',authenticated:false,body,signal:controller.signal});
      if(!Array.isArray(map.units) || selected.some(id=>!map.units.some(unit=>unit.id===id && unit.available))) {setUnits(map.units??[]);setSelected([]);setQuote(undefined);setError('Ô kho này vừa được đặt. Vui lòng chọn ô khác.');setStep(3);return;}
      const created=await apiRequest<Row>('/reservations',{method:'POST',body,signal:controller.signal});
      router.replace('/customer/reservations/'+encodeURIComponent(text(created,'id','reference')));
    } catch(caught) {setError(caught instanceof Error ? caught.message : 'Chưa gửi được yêu cầu. Bạn thử lại nhé.');if(caught instanceof ApiError && caught.status===409) {setSelected([]);setQuote(undefined);setStep(2);setError('Kho vừa có thay đổi. Hãy kiểm tra lại ô trống.');}}
    finally {locked.current=false;request.current=null;setBusy(false);}
  }
  const floors=[...new Set(units.map(unit=>unit.floor??''))], zones=[...new Set(units.filter(unit=>(unit.floor??'')===floor).map(unit=>unit.zone??''))];
  const visible=units.filter(unit=>(unit.floor??'')===floor && (unit.zone??'')===zone);
  const toggle=(unit:FloorPlanUnit)=>{if(!unit.available)return;setError('');setSelected(previous=>previous.includes(unit.id)?previous.filter(id=>id!==unit.id):Number(quantity)===1?[unit.id]:previous.length<Number(quantity)?[...previous,unit.id]:previous);};
  const webOrigin=process.env.EXPO_PUBLIC_WEB_URL || (__DEV__ ? new URL(apiUrl).origin.replace(/:\d+$/,':5173') : '');
  const assetOrigin=process.env.EXPO_PUBLIC_MODEL_ASSET_URL || (__DEV__ ? new URL(apiUrl).origin.replace(/:\d+$/,':8081') : webOrigin);
  const previewSize={...size, id:product?.sizeId, name:product?.name, dimensions:text(product??{},'dimensions')||text(size??{},'dimensions'), image:text(product??{},'image')||text(size??{},'image')} as unknown as StorageSize;
  const image=text(product??{},'image')||text(size??{},'image');
  const back=()=>{if(busy)return;if(step>1)setStep(step-1);else if(router.canGoBack())router.back();else router.replace('/customer');};
  const clearQuote = () => {version.current++;request.current?.abort();request.current=null;setBusy(false);setQuote(undefined);setError('');};
  const editLink = (title:string,target:number) => <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>setStep(target)} style={{minHeight:44,paddingHorizontal:4,justifyContent:'center'}}><Text style={{fontSize:14,fontWeight:'600',color:'#315D99'}}>{title}</Text></Pressable>;
  const primary=step===1?'Chọn thời gian thuê':step===2?busy?'Đang kiểm tra kho…':'Xem ô còn trống':step===3?'Chọn thiết bị thêm':step===4?busy?'Đang cập nhật chi phí…':selections.length?'Xem chi phí':'Bỏ qua · Xem chi phí':busy?'Đang gửi yêu cầu…':'Gửi yêu cầu đặt kho';
  return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,backgroundColor:C.surface}}><Stack.Screen options={{headerShown:false}}/>
    <View style={{paddingTop:insets.top+4,paddingHorizontal:16,gap:12,paddingBottom:12}}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><Pressable accessibilityRole="button" accessibilityLabel="Quay lại" disabled={busy} onPress={back} style={{minWidth:44,minHeight:44,justifyContent:'center'}}><ChevronLeft color={C.text}/></Pressable><Text accessibilityRole="header" style={{flex:1,fontSize:22,lineHeight:30,fontWeight:'700',color:C.text}}>{titles[step-1]}</Text><Text style={{fontSize:14,color:C.muted}}>{step}/5</Text></View><View style={{flexDirection:'row',gap:6}}>{titles.map((title,index)=><Pressable key={title} accessibilityRole="button" accessibilityLabel={'Bước '+(index+1)+': '+title} accessibilityState={{disabled:busy||index+1>=step,selected:index+1===step}} disabled={busy||index+1>=step} onPress={()=>{setError('');setStep(index+1);}} style={{flex:1,minHeight:44,justifyContent:'center'}}><View style={{height:4,borderRadius:4,backgroundColor:index<step?'#315D99':C.border}}/></Pressable>)}</View></View>
    {step===4 ? <ServiceCatalog services={addons.data??[]} selections={selections} start={start} end={end} loading={addons.loading} error={addons.error} retry={addons.refresh} quoteInput={payload()} busy={busy} onChange={value=>{clearQuote();setSelections(value);}} onContinue={()=>void availability(5,true)}/> : <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{padding:16,gap:20,paddingBottom:24}}>
      {catalog.loading && !catalog.data ? <LoadingState/> : catalog.error ? <ErrorState message={catalog.error} onRetry={catalog.refresh}/> : !product ? <Text style={styles.copy}>Chưa có loại kho để chọn.</Text> : <CustomerReveal key={step}>
      {step===1 && <><Text style={styles.copy}>Bạn muốn lưu trữ những gì?</Text><View style={{height:230,borderRadius:16,overflow:'hidden',backgroundColor:C.surfaceSecondary}}>{preview && assetOrigin ? <StoragePreview size={previewSize} assetOrigin={assetOrigin} dom={{useExpoDOMWebView:false,scrollEnabled:false,style:{height:230,width:'100%'}}}/> : image && failedImage !== image ? <Image source={{uri:image.startsWith('/') && webOrigin?webOrigin+image:image}} onError={()=>setFailedImage(image)} resizeMode="contain" accessibilityLabel={'Ảnh minh họa '+text(product,'name')} style={{width:'100%',height:230}}/> : <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Warehouse color={C.navy} size={52}/><Text style={styles.copy}>Chưa có ảnh cho loại kho này</Text></View>}</View><Text style={[styles.title,{fontSize:20}]}>{text(product,'name')}</Text>{Boolean(text(product,'description'))&&<Text style={styles.copy}>{text(product,'description')}</Text>}<Text style={{fontSize:16,color:C.text}}>{previewSize.dimensions}</Text><Text style={{fontSize:18,fontWeight:'600',color:C.navy}}>{typeof product.monthlyPrice==='number'?formatMoney(product.monthlyPrice)+'/tháng':'Xem giá sau khi chọn ngày'}</Text>{assetOrigin && ['locker','small','medium','large'].includes(String(product.sizeId)) && Boolean(previewSize.dimensions) && <Button title={preview?'Xem ảnh':'Xem 3D từ bản web'} variant="secondary" onPress={()=>setPreview(value=>!value)}/>}<Text style={styles.copy}>Ảnh và 3D minh họa loại kho, không phải ảnh vị trí thực tế.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10}}>{products.map(item=><Pressable key={text(item,'id')} accessibilityRole="radio" accessibilityState={{checked:productId===item.id}} onPress={()=>{invalidate();setProduct(text(item,'id'));if(item.allowDailyRental===false)setMode('duration');setPreview(false);}} style={{width:88,minHeight:110,alignItems:'center',gap:6,padding:6,borderBottomWidth:productId===item.id?3:0,borderColor:C.navy}}>{text(item,'image')?<Image source={{uri:text(item,'image').startsWith('/')&&webOrigin?webOrigin+text(item,'image'):text(item,'image')}} resizeMode="contain" style={{width:54,height:54}}/>:<Warehouse size={40} color={C.navy}/>}<Text style={{fontSize:14,color:C.text,textAlign:'center'}}>{text(item,'name')}</Text></Pressable>)}</ScrollView></>}
      {step===2 && <><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={[styles.title,{flex:1}]}>{text(product,'name')}</Text><Pressable accessibilityRole="button" accessibilityLabel="Điều kiện thuê của loại kho" onPress={()=>Alert.alert('Cách thuê',product.allowDailyRental===false?'Loại kho này chỉ cho thuê theo tháng, không cho thuê theo ngày.':product.allowDailyRental===true?'Loại kho này hỗ trợ thuê theo tháng và thuê ngắn ngày.'+(Number(product.minRentalDays)>0?' Thuê ngắn ngày tối thiểu '+product.minRentalDays+' ngày.':''):'Chọn ngày thuê để kiểm tra điều kiện và giá chính xác.')} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><Info size={20} color={C.navy}/></Pressable></View><CustomerChoices title="Cách thuê" value={mode} options={[{value:'duration',label:'Theo tháng'},...(product.allowDailyRental===false?[]:[{value:'dates',label:'Theo ngày'}])]} onChange={value=>{invalidate();setMode(value as 'duration'|'dates');setEnd('');}}/><RentalCalendar start={start} end={end} daily={mode==='dates'} onChange={(from,to)=>{invalidate();setStart(from);setEnd(to);}}/>{mode==='duration'&&<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontSize:16,color:C.text}}>Thời hạn thuê</Text><View style={{flexDirection:'row',alignItems:'center',gap:8}}><Pressable accessibilityRole="button" accessibilityLabel="Giảm thời hạn" disabled={durations.indexOf(months)<=0} onPress={()=>{invalidate();setMonths(durations[Math.max(0,durations.indexOf(months)-1)]);}} style={{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center'}}><Minus color={C.navy}/></Pressable><Text style={{fontSize:16,color:C.text}}>{months} tháng</Text><Pressable accessibilityRole="button" accessibilityLabel="Tăng thời hạn" disabled={durations.indexOf(months)>=durations.length-1} onPress={()=>{invalidate();setMonths(durations[Math.min(durations.length-1,durations.indexOf(months)+1)]);}} style={{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center'}}><Plus color={C.navy}/></Pressable></View></View>}<Text style={styles.title}>Thời gian thuê</Text><Text style={{fontSize:16,color:C.text}}>{start?formatDate(start):'Chọn ngày bắt đầu'} – {end?formatDate(end):'Chọn ngày kết thúc'}</Text><View style={{paddingTop:8}}><Field title="Số kho cần thuê (1–3)" value={quantity} numeric maxLength={1} onChange={value=>{invalidate();setQuantity(value.replace(/\D/g,''));}}/></View></>}
      {step===3 && <><View style={{gap:4}}><Text style={styles.title}>{text(product,'name')}</Text><Text style={styles.copy}>{previewSize.dimensions} · {formatDate(start)} – {formatDate(end)}</Text></View>{floors.length>1&&<CustomerChoices title="Tầng" value={floor} options={floors.map(value=>({value,label:value?'Tầng '+value:'Các kho khác'}))} onChange={value=>{setFloor(value);setZone(units.find(unit=>(unit.floor??'')===value)?.zone??'');}}/>}{zones.length>1&&<CustomerChoices title="Khu vực" value={zone} options={zones.map((value,index)=>({value,label:'Khu vực '+(index+1)}))} onChange={setZone}/>}<BookingUnitSelector units={visible} selected={selected} onSelect={toggle}/><Text style={styles.title}>{selected.length?'Đã chọn: '+units.filter(unit=>selected.includes(unit.id)).map(unit=>unit.code).join(', '):'Chưa chọn ô kho'}</Text></>}
      {step===5 && <><View style={{gap:4}}><Text style={styles.title}>{text(product,'name')}</Text><Text style={styles.copy}>{previewSize.dimensions} · {units.filter(unit=>selected.includes(unit.id)).map(unit=>unit.code).join(', ')}</Text><View style={{paddingVertical:12,paddingHorizontal:14,borderRadius:12,borderWidth:1,borderColor:'#315D99',gap:4,marginTop:8}}><Text style={{fontSize:14,fontWeight:'600',color:C.muted}}>Thời gian thuê · {mode==='duration'?months+' tháng':'Theo ngày'}</Text><Text style={{fontSize:18,lineHeight:26,fontWeight:'700',color:'#123E85'}}>{formatDate(start)} → {formatDate(end)}</Text></View></View><CustomerChoices title="Cách trả tiền thuê" value={plan} options={[{value:'PAY_MONTHLY',label:'Trả hàng tháng'},{value:'PREPAID',label:'Trả thẳng'}]} onChange={value=>{if(request.current||locked.current||busy||value===plan)return;setQuote(undefined);setPlan(value as 'PAY_MONTHLY'|'PREPAID');void availability(5,true,value as 'PAY_MONTHLY'|'PREPAID');}}/>{busy?<LoadingState layout="compact" label="Đang cập nhật chi phí…"/>:quote?<BookingBill quote={quote}/>:<Button title="Cập nhật chi phí" variant="secondary" onPress={()=>void availability(5,true)}/>}{profileContactIssue(user?.fullName??'',user?.phone??'')&&<Navigation title="Bổ sung thông tin liên hệ" path="/customer/account"/>}</>}

      </CustomerReveal>}{error?<View style={{gap:8}}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>{step===2&&<Button title="Thử lại" variant="secondary" disabled={busy} onPress={()=>void availability(3)}/>}</View>:null}
    </ScrollView>}
    {step!==4 && <View style={{paddingHorizontal:16,paddingTop:12,paddingBottom:Math.max(insets.bottom,12),borderTopWidth:1,borderColor:'#E4E7EC',backgroundColor:'white',gap:8}}>
      {step===3&&editLink('Sửa ngày thuê',2)}
      {step===3&&<Text style={{fontSize:14,lineHeight:20,color:C.muted}}>{selected.length ? 'Đã chọn '+selected.length+'/'+quantity+' ô kho' : 'Chọn ô còn trống để tiếp tục'}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={primary} accessibilityState={{busy,disabled:busy||catalog.loading||!product||step===3&&selected.length!==Number(quantity)||step===5&&(!quote||Boolean(profileContactIssue(user?.fullName??'',user?.phone??'')))}} disabled={busy||catalog.loading||!product||step===3&&selected.length!==Number(quantity)||step===5&&(!quote||Boolean(profileContactIssue(user?.fullName??'',user?.phone??'')))} onPress={()=>{setError('');if(step===1)setStep(2);else if(step===2)void availability(3);else if(step===3)setStep(4);else if(step===4)void availability(5,true);else void submit();}} style={({pressed})=>({minHeight:52,borderRadius:12,paddingHorizontal:18,paddingVertical:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,backgroundColor:catalog.loading||!product||step===3&&selected.length!==Number(quantity)||step===5&&(!quote||Boolean(profileContactIssue(user?.fullName??'',user?.phone??'')))?'#E4E7EC':pressed?'#244876':'#315D99'})}>
        {busy&&<ActivityIndicator size="small" color="white"/>}<Text style={{fontSize:16,lineHeight:24,fontWeight:'600',textAlign:'center',flexShrink:1,color:catalog.loading||!product||step===3&&selected.length!==Number(quantity)||step===5&&(!quote||Boolean(profileContactIssue(user?.fullName??'',user?.phone??'')))?'#667085':'white'}}>{primary}</Text>{!busy&&<ArrowRight size={20} color={catalog.loading||!product||step===3&&selected.length!==Number(quantity)||step===5&&(!quote||Boolean(profileContactIssue(user?.fullName??'',user?.phone??'')))?'#667085':'white'}/>}
      </Pressable>
    </View>}
  </KeyboardAvoidingView>;
}

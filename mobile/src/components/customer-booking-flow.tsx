import { BookingHeader, BookingTabs } from './booking-header';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Calculator, CalendarDays, Check, CircleCheck, CreditCard, FileText, Info, Minus, Plus, Warehouse } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/use-auth';
import { usePublicCatalog } from '@/hooks/use-public-catalog';
import { useResource } from '@/operations/use-resource';
import { apiRequest, apiUrl, ApiError } from '@/services/api';
import { useDraftGuard } from '@/services/live-events';
import { object, rows, text, type Row } from '@/operations/model';
import { Button, Navigation, styles } from '@/operations/ui';
import { WdpColors as C } from '@/constants/wdp-theme';
import { isCalendarDate, vietnamCalendarDate } from '@/utils/calendar-date';

import { formatDate, formatMoney } from '@/utils/format';
import { profileContactIssue } from '@/utils/profile-contact';
import { serviceSelectionIssue } from '@/utils/service-period';
import type { AdditionalService, ServiceInventory, ServiceSelection } from '@/types/additional-service';
import { FloorPlanViewer, type FloorPlanUnit } from './floor-plan-viewer';
import type { StoragePreviewSize } from './storage-architectural-viewer';
import { ServiceCatalog } from './service-catalog';
import { quotePaymentSummary } from '@/utils/quote-payment-summary';
import { BookingBill } from './booking-bill';
import { matchingStorage, storageArea, StorageComparison } from './storage-comparison';
import { CustomerReveal } from './customer-flow';
import { ErrorState, LoadingState } from './screen-state';
import { RentalCalendar } from './rental-calendar';
import { acceptsBookings, BookingFacilityPicker, isBookingFacility, type BookingFacility } from './booking-facility-picker';
import { useBookingFacility } from './booking-facility-context';


type UnitMap = {productId: string; startDate: string; endDateExclusive: string; units: FloorPlanUnit[]};
const monthEnd = (start: string, months: number) => {if(!isCalendarDate(start) || !Number.isInteger(months) || months<1)return '';const date=new Date(start+'T00:00:00Z');const result=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+months,1));result.setUTCDate(Math.min(date.getUTCDate(),new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate()));return result.toISOString().slice(0,10);};

const unitStatus: Record<FloorPlanUnit['status'], { label: string; background: string }> = {
  AVAILABLE: { label: 'Còn trống', background: '#DCF4E6' },
  RESERVED: { label: 'Đã giữ', background: '#FFF0CF' },
  OCCUPIED: { label: 'Đang sử dụng', background: '#EDF0F4' },
  MAINTENANCE: { label: 'Bảo trì', background: '#FBE4E6' },
};

export function CustomerBookingFlow() {
  const catalog = usePublicCatalog(undefined, true, true);
  const { facilityId, selectFacility } = useBookingFacility();
  const [choosing, setChoosing] = useState(false);
  const insets = useSafeAreaInsets();
  const entries = catalog.data?.facilities;
  const productFacilityIds = [...new Set(rows(catalog.data?.products).map(item => text(item, 'facilityId')).filter(Boolean))];
  const facilities: BookingFacility[] = entries === undefined
    ? productFacilityIds.map(id => ({
        id, name: productFacilityIds.length === 1 ? 'Cơ sở đang nhận đặt kho' : 'Cơ sở · ' + id,
        address: '', bookingEnabled: true, operationalStatus: 'OPEN',
      }))
    : Array.isArray(entries) ? entries.filter(isBookingFacility) : [];
  const facility = facilities.find(item => item.id === facilityId && acceptsBookings(item));
  const invalidList = entries !== undefined && (!Array.isArray(entries) ||
    entries.length !== facilities.length || new Set(facilities.map(item => item.id)).size !== facilities.length);

  useEffect(() => {
    if (catalog.data && !invalidList && facilityId && !facility) selectFacility('');
  }, [catalog.data, invalidList, facilityId, facility, selectFacility]);

  const leave = () => {
    if (facility && choosing && !catalog.error && !invalidList) setChoosing(false);
    else if (router.canGoBack()) router.back();
    else router.replace('/customer');
  };
  const pickerError = catalog.error || (invalidList ? 'Danh sách cơ sở không hợp lệ.' : undefined);
  const showPicker = !facility || choosing || !catalog.data || Boolean(pickerError);

  return <View style={{ flex: 1 }}>
    {facility && <View style={showPicker ? { display: 'none' } : { flex: 1 }}>
      <BookingWizard key={facility.id} facility={facility} hidden={showPicker}
        onChangeFacility={() => setChoosing(true)} refreshFacilities={catalog.refresh} />
    </View>}
    {showPicker && <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: 'white' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <BookingFacilityPicker facilities={facilities} selected={facilityId} onBack={leave}
        loading={catalog.loading || (!catalog.data && !pickerError)} error={pickerError} onRetry={catalog.refresh}
        onSelect={item => { selectFacility(item.id); setChoosing(false); }} />
    </View>}
  </View>;
}

function BookingWizard({ facility, hidden = false, onChangeFacility, refreshFacilities }: {
  facility: BookingFacility;
  hidden?: boolean;
  onChangeFacility?: () => void;
  refreshFacilities: () => void;
}) {

  const params = useLocalSearchParams<{product?: string; size?: string; minimumArea?: string; startDate?: string; endDate?: string; durationMonths?: string; periodMode?: string; unit?: string}>();
  const catalog = usePublicCatalog(facility.id, true, true);
  const {user} = useAuth(), insets = useSafeAreaInsets();
  const wrongScope = Boolean(facility && catalog.data && (
    catalog.data.facilityId !== facility.id || rows(catalog.data.products).some(item => item.facilityId !== facility.id)
  ));
  const sizes = rows(catalog.data?.sizes);
  const minimumArea = Number(params.minimumArea);
  const filtered = Number.isFinite(minimumArea) && minimumArea > 0;
  const allProducts = wrongScope ? [] : rows(catalog.data?.products);
  const products = filtered ? matchingStorage(allProducts, sizes, minimumArea).map(item => item.product) : allProducts;
  const [step,setStep] = useState(1), [productChoice,setProduct] = useState(params.product ?? '');
  const product = products.find(row => text(row,'id') === productChoice) ?? (!productChoice || step === 1 ? products.find(row => row.sizeId === params.size) ?? products[0] : undefined);
  const productId = text(product ?? {},'id'), size = sizes.find(row => row.id === product?.sizeId);
  const productFacilityId = text(product ?? {}, 'facilityId');
  const addons = useResource<AdditionalService[]>(productFacilityId
    ? '/additional-services?facilityId=' + encodeURIComponent(productFacilityId) : null);
  const serviceScopeMismatch = addons.data !== undefined && (!Array.isArray(addons.data)
    || addons.data.some(service => !service || service.facilityId !== productFacilityId));
  const services = serviceScopeMismatch ? [] : addons.data ?? [];
  const durations = Array.isArray(catalog.data?.approvedDurations)
    ? [...new Set(catalog.data.approvedDurations.filter((value): value is number =>
      typeof value === 'number' && Number.isSafeInteger(value) && value > 0))].sort((a, b) => a - b)
    : [];
  const [mode,setMode] = useState<'duration'|'dates'>(params.periodMode === 'dates' ? 'dates' : 'duration');
  const allowsDaily = product?.allowDailyRental === true;
  const effectiveMode = allowsDaily ? mode : 'duration';
  const [start,setStart] = useState(isCalendarDate(params.startDate ?? '') ? params.startDate! : '');
  const [dailyEnd,setEnd] = useState(isCalendarDate(params.endDate ?? '') ? params.endDate! : '');
  const [chosenMonths,setMonths] = useState(Number(params.durationMonths) || 3), [quantity,setQuantity] = useState('1');
  const months = durations.includes(chosenMonths) ? chosenMonths : durations[0] ?? 0;
  const [plan,setPlan] = useState<'PAY_MONTHLY'|'PREPAID'>('PAY_MONTHLY');
  const [selections,setSelections] = useState<ServiceSelection[]>([]);
  const [units,setUnits] = useState<FloorPlanUnit[]>([]), [selected,setSelected] = useState<string[]>([]);
  const [quote,setQuote] = useState<Row>(), [busy,setBusy] = useState(false), [error,setError] = useState(''), [soldOut,setSoldOut] = useState(false);
  const [createdBooking,setCreatedBooking] = useState<Row>();
  const [floor,setFloor] = useState(''), [zone,setZone] = useState('');
  const [failedImage,setFailedImage] = useState('');
  const request = useRef<AbortController|null>(null), locked = useRef(false), version = useRef(0);
  const end = effectiveMode === 'duration' ? monthEnd(start, months) : dailyEnd;
  useDraftGuard(Boolean(start || selections.length || busy));
  useEffect(() => () => request.current?.abort(), []);
  useFocusEffect(useCallback(() => {if(hidden)return;const sub = BackHandler.addEventListener('hardwareBackPress', () => {if(busy)return true;if(createdBooking){router.dismissTo('/customer');return true;}if(step > 1 && !locked.current) {setStep(step - 1); return true;} return locked.current;}); return () => sub.remove();}, [step,busy,createdBooking,hidden,setStep]));
  const invalidate = () => {version.current++; request.current?.abort(); request.current=null; setBusy(false); setUnits([]); setSelected([]); setQuote(undefined); setError(''); setSoldOut(false);};
  const chooseProduct = (choice: Row) => {
    invalidate();
    setStep(1);
    setSelections([]);
    if (choice.facilityId === productFacilityId) addons.refresh();
    setProduct(text(choice, 'id'));
    if (choice.allowDailyRental !== true) setMode('duration');
  };
  const payload = (ids = selected) => ({productId, ...(facility ? { facilityId: facility.id } : {}), startDate:start, quantity:Number(quantity), ...(effectiveMode === 'duration' ? { periodMode: 'duration', durationMonths: months } : { periodMode: 'dates', endDate: end }), paymentPlan:plan, paymentChoice:'pay-later', adjacencyPreference:false, ...(ids.length ? {selectedUnitIds:ids} : {}), addonIds:[], services:selections});
  const serviceScopeIssue = selections.length > 0 && selections.some(selection => !services.some(service => service.id === selection.serviceId));
  function validate(includeServices = true) {
    if (catalog.error || wrongScope || (facility && productFacilityId !== facility.id)) return 'Chưa xác minh được loại kho tại cơ sở đã chọn.';
    if (!product) return 'Chọn loại kho.';
    if (!isCalendarDate(start) || start < vietnamCalendarDate()) return 'Chọn ngày bắt đầu từ hôm nay.';
    if (effectiveMode === 'duration' && !durations.includes(months)) return 'Chưa tải được thời hạn thuê được hỗ trợ.';
    if (!isCalendarDate(end) || end <= start) return 'Chọn ngày kết thúc sau ngày bắt đầu.';
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 3) return 'Bạn có thể đặt từ 1 đến 3 kho.';
    if (effectiveMode === 'dates' && end >= monthEnd(start, 1)) return 'Chọn kỳ thuê theo tháng nếu thuê từ một tháng trở lên.';
    if (effectiveMode === 'dates' && rentalDays < Number(product.minRentalDays)) return 'Thời gian thuê tối thiểu là ' + product.minRentalDays + ' ngày.';
    if (!includeServices) return '';
    if (serviceScopeIssue) return 'Dịch vụ không còn khả dụng tại cơ sở này. Vui lòng chọn lại.';
    return selections.map(selection => serviceSelectionIssue(services.find(service => service.id === selection.serviceId), selection, start, end)).find(Boolean) || '';
  }

  function assertUnitMap(map: UnitMap) {
    if (map?.productId !== productId || map.startDate !== start || map.endDateExclusive !== end || !Array.isArray(map.units) ||
        map.units.some(unit => !unit || typeof unit.id !== 'string' || typeof unit.code !== 'string' ||
          typeof unit.available !== 'boolean' || !Object.prototype.hasOwnProperty.call(unitStatus, unit.status) ||
          (unit.available && unit.status !== 'AVAILABLE'))) {
      throw new Error('Không thể xác minh các ô kho phù hợp. Vui lòng thử lại.');
    }
  }
  async function availability(nextStep: number, revalidate = false, chosenPlan = plan, skipServices = false) {
    if(request.current || locked.current) return;
    const requestedServices = nextStep===5 && !skipServices ? selections : [];
    const issue = validate(nextStep===5 && !skipServices); if(issue) {setError(issue); return;}
    const controller = new AbortController(), revision = version.current;
    request.current=controller; setBusy(true); setError(''); setSoldOut(false);
    try {
      for(const selection of requestedServices) {
        const query = new URLSearchParams({facilityId:productFacilityId,quantity:String(selection.quantity), ...(selection.serviceStartDate ? {startDate:selection.serviceStartDate} : {}), ...(selection.serviceEndDate ? {endDate:selection.serviceEndDate} : {})});
        const inventory = await apiRequest<ServiceInventory>('/additional-services/'+encodeURIComponent(selection.serviceId)+'/availability?'+query,{signal:controller.signal});
        if(!inventory.available) throw new Error('Dịch vụ thêm không còn đủ số lượng. Hãy sửa lựa chọn dịch vụ.');
      }
      const body=JSON.stringify({...payload(revalidate ? selected : []), paymentPlan:chosenPlan,services:requestedServices});
      const result=await apiRequest<Row>('/booking/availability',{method:'POST',authenticated:false,body,signal:controller.signal});
      const map=(result.available === true || revalidate) ? await apiRequest<UnitMap>('/booking/unit-map',{method:'POST',authenticated:false,body,signal:controller.signal}) : undefined;
      if(controller.signal.aborted || version.current !== revision) return;
      if (map) assertUnitMap(map);
      if(!map || map.units.filter(unit=>unit.available).length<Number(quantity)) {
        setUnits([]);setSelected([]);setQuote(undefined);setSoldOut(true);setStep(2);return;
      }
      const validSelection=selected.filter(id=>map.units.some(unit=>unit.id===id && unit.available));
      const first=map.units.find(unit=>validSelection.includes(unit.id)) ?? map.units.find(unit=>unit.available)!;
      setUnits(map.units);
      setFloor(first.floor??'');setZone(first.zone??'');
      if(revalidate && (result.available!==true || validSelection.length!==selected.length)) {
        setSelected(validSelection);
        setQuote(undefined);
        setError('Một hoặc nhiều ô đã thay đổi. Vui lòng kiểm tra ô kho và chọn lại.');
        setStep(3);
        return;
      }
      setQuote(object(result.quote));
      if(skipServices)setSelections([]);
      setStep(nextStep);
    } catch(caught) {if (!controller.signal.aborted) {
      if (caught instanceof ApiError && caught.status === 409 && facility) {
        refreshFacilities();
        catalog.refresh();
      }
      setError(caught instanceof Error ? caught.message : 'Không thể kiểm tra kho lúc này.');
    }}
    finally {if(request.current===controller) {request.current=null;setBusy(false);}}
  }
  async function submit() {
    if(createdBooking || locked.current || request.current || !quote || !quoteReady || selected.length !== Number(quantity)) return;
    const issue=validate() || profileContactIssue(user?.fullName??'', user?.phone??''); if(issue) {setError(issue);return;}
    locked.current=true;setBusy(true);setError('');
    const controller=new AbortController();request.current=controller;
    try {
      const body=JSON.stringify(payload());
      const map=await apiRequest<UnitMap>('/booking/unit-map',{method:'POST',authenticated:false,body,signal:controller.signal});
      assertUnitMap(map);
      if(selected.some(id=>!map.units.some(unit=>unit.id===id && unit.available))) {setUnits(map.units);setSelected([]);setQuote(undefined);setError('Ô kho này vừa được đặt. Vui lòng chọn ô khác.');setStep(3);return;}
      const check = await apiRequest<Row>('/booking/availability', { method:'POST', authenticated:false, body, signal:controller.signal });
      if (check.available !== true) {
        setQuote(undefined); setSelected([]); setStep(2); setError('Kho vừa hết chỗ. Vui lòng kiểm tra lại.'); return;
      }
      const latest = object(check.quote);
      const fields = ['quotedTotalAmount', 'estimatedInitialAmountDue', 'paymentPlan', 'depositAmount', 'discountAmount', 'rentalAmount', 'addOnTotalAmount'] as const;
      if (fields.some(field => latest[field] !== quote[field]) || JSON.stringify(latest.services) !== JSON.stringify(quote.services) ||
          JSON.stringify(latest.initialPaymentBreakdown) !== JSON.stringify(quote.initialPaymentBreakdown)) {
        setQuote(latest); setError('Báo giá đã thay đổi. Vui lòng xem lại chi phí trước khi gửi.'); return;
      }
      const created=await apiRequest<Row>('/reservations',{method:'POST',body,signal:controller.signal});
      setCreatedBooking(created);
    } catch(caught) {setError(caught instanceof Error ? caught.message : 'Chưa gửi được yêu cầu. Bạn thử lại nhé.');if(caught instanceof ApiError && caught.status===409) {refreshFacilities();catalog.refresh();setSelected([]);setQuote(undefined);setStep(2);setError('Kho vừa có thay đổi. Hãy kiểm tra lại ô trống.');}}
    finally {locked.current=false;request.current=null;setBusy(false);}
  }
  const floors=[...new Set(units.map(unit=>unit.floor??''))], zones=[...new Set(units.filter(unit=>(unit.floor??'')===floor).map(unit=>unit.zone??''))];
  const visible=units.filter(unit=>(unit.floor??'')===floor && (unit.zone??'')===zone);
  const orderedUnits = [...visible].sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.position ?? 0) - (b.position ?? 0));
  const activeIndex = orderedUnits.findIndex(unit => selected.includes(unit.id));
  const nearbyStart = Math.max(0, Math.min(activeIndex - 1, orderedUnits.length - 3));
  const detailUnits = orderedUnits.filter((unit, index) =>
    !Number.isInteger(unit.row) || !Number.isInteger(unit.position)
    || selected.includes(unit.id) || (index >= nearbyStart && index < nearbyStart + 3));
  const toggle=(unit:FloorPlanUnit)=>{if(busy || request.current || !unit.available)return;setError('');setQuote(undefined);setSelected(previous=>previous.includes(unit.id)?previous.filter(id=>id!==unit.id):Number(quantity)===1?[unit.id]:previous.length<Number(quantity)?[...previous,unit.id]:previous);};
  const webOrigin=process.env.EXPO_PUBLIC_WEB_URL || (__DEV__ ? new URL(apiUrl).origin.replace(/:\d+$/,':5173') : '');
  const image=text(product??{},'image')||text(size??{},'image');
  const previewSize: StoragePreviewSize = {
    id: product?.sizeId as StoragePreviewSize['id'],
    name: text(product ?? {}, 'name'),
    dimensions: text(product ?? {}, 'dimensions') || text(size ?? {}, 'dimensions'),
    image: image.startsWith('/') && webOrigin ? webOrigin + image : image,
  };
  const area = product ? storageArea(product,sizes) : 0;
  const areaLabel = area > 0 ? area.toLocaleString('vi-VN') + ' m²' : '';
  const rentalDays = (Date.parse(end) - Date.parse(start)) / 86400000;
  const back=()=>{if(busy)return;if(createdBooking){router.dismissTo('/customer');return;}if(step>1)setStep(step-1);else if(onChangeFacility)onChangeFacility();else if(router.canGoBack())router.back();else router.replace('/customer');};
  const clearQuote = () => {version.current++;request.current?.abort();request.current=null;setBusy(false);setQuote(undefined);setError('');};
  const submittedPayment = createdBooking ? quotePaymentSummary(object(createdBooking.quote ?? quote)) : undefined;
  const payment = quote ? quotePaymentSummary(quote) : undefined;
  const quoteReady = payment != null && payment.total !== null && payment.first !== null && quote?.paymentPlan === plan;
  const selectedCodes = units.filter(unit => selected.includes(unit.id)).map(unit => unit.code).join(', ');
  const editLink = (title:string,target:number) => <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>setStep(target)} style={{minHeight:44,paddingHorizontal:4,justifyContent:'center'}}><Text style={{fontSize:14,fontWeight:'600',color:'#315D99'}}>{title}</Text></Pressable>;
  const primaryDisabled = busy || catalog.loading || Boolean(catalog.error) || wrongScope || !product
    || (step === 3 && selected.length !== Number(quantity))
    || (step === 5 && (!quoteReady || selected.length !== Number(quantity) || Boolean(profileContactIssue(user?.fullName ?? '', user?.phone ?? ''))));
  const primary=step===1?'Chọn thời gian thuê':step===2?busy?'Đang kiểm tra kho…':'Kiểm tra ô còn trống':step===3?busy?'Đang kiểm tra ô kho…':'Chọn thiết bị thêm':busy?'Đang gửi yêu cầu…':'Xác nhận & tiếp tục';
  return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,backgroundColor:C.surface}}><Stack.Screen options={{headerShown:false}}/>
    <View style={{paddingTop:insets.top}}><BookingHeader step={step + 1} busy={busy} onBack={back} /></View>
    {!createdBooking && <View style={[booking.summary, { marginHorizontal: 15, marginTop: 3 }]}>
      <View style={booking.summaryIcon}><Warehouse size={20} color={blue} /></View>
      <View style={{ flex: 1 }}><Text style={booking.label}>{facility.name}</Text>
        {facility.address ? <Text style={booking.muted}>{facility.address}</Text> : null}</View>
      {step === 1 && onChangeFacility && <Pressable accessibilityRole="button" disabled={busy}
        onPress={onChangeFacility} style={booking.change}><Text style={booking.link}>Đổi cơ sở</Text></Pressable>}
    </View>}
    {createdBooking ? <ScrollView contentContainerStyle={{ padding:16, gap:16 }}>
      <View style={{ alignItems:'center', paddingVertical:20, gap:8 }}>
        <View style={{width:72,height:64,borderRadius:20,backgroundColor:"#EDF3FD",alignItems:"center",justifyContent:"center"}}><FileText size={44} color="#0758DC" /><View style={{position:"absolute",right:-4,bottom:-3,backgroundColor:"white",borderRadius:16}}><CircleCheck size={27} color="#0758DC" /></View></View>
        <Text style={{ fontSize:22, fontWeight:'800', color:C.text, textAlign:'center' }}>Đã gửi yêu cầu đặt kho</Text>
        <Text style={{ color:'#0758DC', fontWeight:'700', backgroundColor:'#EDF3FD', paddingHorizontal:12, paddingVertical:6, borderRadius:18 }}>{createdBooking.status === 'CONFIRMED' ? 'Đơn đã được xác nhận' : createdBooking.status === 'PENDING' ? 'Đang chờ xác nhận' : createdBooking.status === 'CANCELLED' ? 'Đơn đã hủy' : createdBooking.status === 'EXPIRED' ? 'Đơn đã hết hạn' : createdBooking.status === 'REJECTED' ? 'Đơn chưa được chấp thuận' : 'Xem trạng thái trong đơn đặt'}</Text><Text style={[styles.copy,{textAlign:'center'}]}>NestBox đã nhận yêu cầu. Bạn có thể theo dõi các bước tiếp theo trong đơn đặt.</Text>
      </View>
      <View style={{ borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, gap:8 }}>
        <Text style={styles.title}>{text(createdBooking,'product.name') || previewSize.name}</Text>
        <Text style={styles.copy}>{previewSize.dimensions} · {Number(quantity)} kho</Text>
        {selectedCodes ? <Text style={styles.copy}>{selectedCodes}</Text> : null}
        <View style={{flexDirection:"row",alignItems:"center",gap:10}}><CalendarDays size={18} color="#0758DC"/><View style={{flex:1}}><Text style={styles.title}>Thời gian thuê</Text><Text style={styles.copy}>{formatDate(start)} – {formatDate(end)}{effectiveMode==="duration" ? " (" + months + " tháng)" : ""}</Text></View></View>
        {submittedPayment ? <View style={{flexDirection:"row",alignItems:"center",gap:10}}><CreditCard size={18} color="#0758DC"/><View style={{flex:1}}><Text style={styles.title}>Cách thanh toán</Text><Text style={styles.copy}>{submittedPayment.plan}{submittedPayment.first !== null ? ' · Lần đầu dự kiến ' + formatMoney(submittedPayment.first) : ''}</Text></View></View> : null}
      </View>
      <Button title="Xem đơn đặt" onPress={() => {
        const id = text(createdBooking,'id','reference');
        if (id) router.replace({ pathname:'/customer/[resource]/[id]', params:{ resource:'reservations', id } });
        else router.replace('/customer/reservations');
      }} />
      <Button title="Về trang chủ" variant="secondary" onPress={() => router.dismissTo('/customer')} />
    </ScrollView> : step===4 ? <ServiceCatalog bookingSummary={[previewSize.name, selectedCodes, formatDate(start) + ' → ' + formatDate(end)].filter(Boolean).join(' · ')} services={services} selections={selections} start={start} end={end} loading={addons.loading} error={serviceScopeMismatch ? 'Danh mục dịch vụ không khớp cơ sở đã chọn.' : addons.error} continueError={error} retry={addons.refresh} quoteInput={payload()} busy={busy} onChange={value=>{clearQuote();setSelections(value);}} onContinue={skip=>void availability(5,true,plan,skip)}/> : <ScrollView key={step} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{paddingHorizontal:15,paddingTop:9,gap:8,paddingBottom:16}}>
      {catalog.loading && !catalog.data ? <LoadingState/> : catalog.error ? <ErrorState message={catalog.error} onRetry={catalog.refresh}/> : wrongScope ? <ErrorState message="Catalog không khớp cơ sở đã chọn." onRetry={catalog.refresh}/> : !product ? <Text style={styles.copy}> {filtered ? 'Hiện chưa có loại kho đủ diện tích ước tính.' : 'Chưa có loại kho để chọn.'}</Text> : <CustomerReveal key={step}>
      {step===1 && <>
        <View style={booking.utilities}>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/customer/size-finder', params: facility ? { facilityId: facility.id } : {} })} style={booking.tool}>
            <View style={booking.summaryIcon}><Calculator size={19} color={blue}/></View><View style={{flex:1}}><Text style={booking.link}>Ước tính kích thước</Text><Text style={booking.muted}>Tìm loại kho phù hợp</Text></View><ArrowRight size={16} color={blue}/>
          </Pressable>
          <StorageComparison compact products={products} sizes={sizes} onChoose={chooseProduct}/>
        </View>
        {filtered && <Text style={booking.label}>Kho phù hợp · từ {minimumArea.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m²</Text>}
        <View style={booking.productCard}><View style={booking.photo}>
          {previewSize.image && failedImage !== previewSize.image
            ? <Image source={{uri:previewSize.image}} onError={()=>setFailedImage(previewSize.image)} resizeMode="cover" accessibilityLabel={'Ảnh minh họa '+previewSize.name} style={{width:'100%',height:'100%'}}/>
            : <Warehouse size={40} color={blue}/>}
        </View>
        <View style={booking.productCopy}>
          <Text style={booking.product}>{previewSize.name}</Text>
          <Text style={booking.meta}>{[previewSize.dimensions, areaLabel, text(product,'volume')].filter(Boolean).join(' · ')}</Text>
          <Text style={booking.price}>{typeof product.monthlyPrice==='number'?formatMoney(product.monthlyPrice)+' / tháng':'Xem giá sau khi chọn ngày'}</Text>
          {text(product, 'description') ? <Text style={booking.meta}>{text(product, 'description')}</Text> : null}
          {previewSize.image && failedImage !== previewSize.image ? <Text style={booking.muted}>Ảnh minh họa loại kho</Text> : null}
        </View>
        </View>{products.length > 1 && <Text style={booking.label}>Chọn loại kho khác</Text>}
        <View style={booking.grid}>
          {products.map(item=>{
            const active = item.id === productId;
            return <Pressable key={text(item,'id')} accessibilityRole="radio" accessibilityState={{checked:active}}
              onPress={()=>{if(!active)chooseProduct(item);}} style={[booking.typeTile, products.length === 4 && {width:"23.5%"}, active&&booking.typeActive]}>
              {active?<Check size={18} color={blue}/>:<Warehouse size={18} color={blue}/>}
              <Text style={[booking.label,{textAlign:'center'}]}>{text(item,'name')}</Text>{!!storageArea(item,sizes) && <Text style={booking.muted}>{storageArea(item,sizes).toLocaleString('vi-VN')} m²</Text>}
            </Pressable>;
          })}
        </View>
      </>}
      {step===2 && <>
        <View style={booking.summary}><Warehouse size={18} color={blue}/><View style={{flex:1}}><Text style={booking.label}>{previewSize.name}</Text><Text style={booking.muted}>{[previewSize.dimensions, areaLabel].filter(Boolean).join(' · ')}</Text></View></View>
        <BookingTabs value={effectiveMode} options={[{value:'duration',label:'Theo tháng'},...(product.allowDailyRental===true?[{value:'dates',label:'Theo ngày'}]:[])]}
          onChange={value=>{if(value===effectiveMode)return;invalidate();setMode(value as typeof mode);setEnd('');}}/>
        <RentalCalendar compact start={start} end={end} daily={effectiveMode==='dates'}
          earliestEnd={start && Number(product.minRentalDays)>0 ? new Date(Date.parse(start)+Number(product.minRentalDays)*86400000).toISOString().slice(0,10) : undefined}
          endLimit={start ? monthEnd(start,1) : undefined} onChange={(from,to)=>{invalidate();setStart(from);setEnd(to);}}/>
        {effectiveMode==='duration' && durations.length > 0 && <BookingStepper label="Thời hạn thuê" display={months+' tháng'} index={durations.indexOf(months)} count={durations.length}
          onChange={index=>{invalidate();setMonths(durations[index]);}}/>}
        <View style={booking.summary}><CalendarDays size={18} color={blue}/><Text style={[booking.meta,{flex:1}]}>
          {start ? formatDate(start) : 'Chọn ngày bắt đầu'} → {end ? formatDate(end) : 'Chọn ngày kết thúc'}
          {effectiveMode==='dates' && rentalDays>0 ? ' · '+rentalDays+' ngày' : ''}
        </Text></View>
        <BookingStepper label="Số kho" display={quantity} index={Number(quantity)-1} count={3} onChange={index=>{invalidate();setQuantity(String(index+1));}}/>
        {soldOut && <View style={booking.utilities}><Text accessibilityRole="alert" style={[styles.error,{flex:1}]}>Không đủ ô trống cho số kho và thời gian bạn chọn.</Text>{editLink('Đổi loại kho',1)}</View>}
      </>}
      {step===3 && <>
        <Pressable accessibilityRole="button" accessibilityLabel="Sửa thời gian thuê" onPress={()=>setStep(2)} style={[booking.summary,{backgroundColor:pale}]}>
          <Warehouse size={18} color={blue}/><Text style={[booking.label,{flex:1}]}>{previewSize.name} · {formatDate(start)} – {formatDate(end)} · {quantity} ô</Text><ArrowRight size={16} color={blue}/>
        </Pressable>
        {floors.length>1 && <BookingOptions value={floor} options={floors.map(value=>({value,label:value ? (/^tầng/i.test(value)?value:'Tầng '+value) : 'Tầng chưa ghi nhận'}))}
          onChange={value=>{setFloor(value);setZone(units.find(unit=>(unit.floor??'')===value)?.zone??'');}}/>}
        {zones.length>1 && <BookingOptions value={zone} options={zones.map(value=>({value,label:value ? (/^khu/i.test(value)?value:'Khu '+value) : 'Khu chưa ghi nhận'}))} onChange={setZone}/>}
        <View style={booking.legend}>{[...Object.values(unitStatus).map(item => [item.label, item.background]), ['Đã chọn', blue]].map(([label,color])=><View key={label} style={booking.legendItem}>
          <View style={{width:12,height:12,borderRadius:3,backgroundColor:color}}/><Text style={booking.muted}>{label}</Text>
        </View>)}</View>
        {visible.some(unit => Number.isInteger(unit.row) && Number.isInteger(unit.position)) && <FloorPlanViewer compact key={floor + ':' + zone}
          units={visible.filter(unit => Number.isInteger(unit.row) && Number.isInteger(unit.position))} selectedIds={selected} onPress={toggle} />}
        {visible.length ? <><Text style={booking.label}>Thông tin ô kho</Text><View style={booking.grid}>{detailUnits.map(unit=>{
          const active=selected.includes(unit.id);
          const disabled=busy || !unit.available || (!active && Number(quantity)>1 && selected.length>=Number(quantity));
          const status = unitStatus[unit.status];
          const color = active ? blue : C.text;
          const statusLabel = unit.status === 'AVAILABLE' && !unit.available ? 'Không khả dụng' : status?.label ?? unit.status;
          return <Pressable key={unit.id} accessibilityRole="checkbox" accessibilityLabel={unit.code+' · '+statusLabel}
            accessibilityState={{checked:active,disabled}} disabled={disabled} onPress={()=>toggle(unit)}
            style={[booking.unit,{backgroundColor:active ? pale : 'white', borderColor:active ? blue : C.border}]}>
            {active && <Check size={14} color={color}/>}
            <Text style={[booking.label,{color,textAlign:'center'}]}>{unit.code}</Text>
            {!!areaLabel && <Text style={[booking.muted,{color}]}>{areaLabel}</Text>}
            <Text style={[booking.muted,{color:active ? blue : unit.available ? "#14734F" : C.muted}]}>{active ? "Đã chọn" : statusLabel}</Text>
          </Pressable>;
        })}</View></> : <Text style={booking.muted}>Chưa có ô kho trong khu này.</Text>}
        <View style={booking.legendItem}><Info size={15} color={blue}/><Text style={[booking.muted,{flex:1}]}>Kiểm tra ô trống chưa giữ chỗ. Kho chỉ được giữ khi hệ thống xác nhận đơn.</Text></View>
        {selectedCodes ? <Text style={booking.label}>Ô đã chọn · {selectedCodes}</Text> : null}
      </>}
      {step===5 && <>
        <View style={booking.productCard}>
          <BookingDetail title={'Loại kho: ' + previewSize.name} detail={[previewSize.dimensions, areaLabel].filter(Boolean).join(' · ')} />
          <BookingDetail title={'Thời gian thuê · ' + (effectiveMode === 'duration' ? months + ' tháng' : rentalDays + ' ngày')}
            detail={formatDate(start) + ' → ' + formatDate(end)} />
          <BookingDetail title={'Vị trí kho: ' + selectedCodes} detail={selected.length + ' ô kho'} />
          <Pressable accessibilityRole="button" onPress={() => setStep(4)}>
            <BookingDetail title={'Thiết bị thêm (' + selections.length + ')'} detail={selections.map(choice => {
              const service = services.find(item => item.id === choice.serviceId);
              return service ? service.name + ' ×' + choice.quantity + (service.kind === 'RENTAL' ? ' (thuê)' : ' (mua)') : '';
            }).filter(Boolean).join(', ')} />
          </Pressable>
        </View>
        <View style={{ gap: 8 }}>
        <Text style={styles.title}>Cách thanh toán</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['PAY_MONTHLY', 'PREPAID'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
            accessibilityState={{ checked: value === plan, disabled: busy }} disabled={busy}
            onPress={() => {
              if (request.current || locked.current || value === plan) return;
              setQuote(undefined);
              setPlan(value);
              void availability(5, true, value);
            }}
            style={{ flex: 1, minHeight: 44, borderRadius: 24, borderWidth: 1, borderColor: value === plan ? '#0758DC' : C.border,
              backgroundColor: value === plan ? '#0758DC' : 'white', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
            <Text style={{ color: value === plan ? 'white' : C.text, fontWeight: '700', textAlign: 'center' }}>{value === 'PAY_MONTHLY' ? 'Trả hàng tháng' : 'Trả thẳng'}</Text>
          </Pressable>)}
        </View>
      </View>{busy?<LoadingState layout="compact" label="Đang cập nhật chi phí…"/>:quote && quoteReady?<BookingBill quote={quote}/>:<Button title="Cập nhật chi phí" variant="secondary" onPress={()=>void availability(5,true)}/>}{profileContactIssue(user?.fullName??'',user?.phone??'')&&<Navigation title="Bổ sung thông tin liên hệ" path="/customer/account"/>}</>}

      </CustomerReveal>}{error?<View style={{gap:8}}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>{step===2&&<Button title="Thử lại" variant="secondary" disabled={busy} onPress={()=>void availability(3)}/>}</View>:null}
    </ScrollView>}
    {!createdBooking && step!==4 && <View style={{paddingHorizontal:16,paddingTop:12,paddingBottom:Math.max(insets.bottom,12),borderTopWidth:1,borderColor:'#E4E7EC',backgroundColor:'white',gap:8}}>

      {step===3&&<Text style={{fontSize:14,lineHeight:20,color:C.muted}}>{selected.length ? 'Đã chọn '+selected.length+'/'+quantity+' ô kho' : 'Chọn ô còn trống để tiếp tục'}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={primary} accessibilityState={{busy,disabled:primaryDisabled}} disabled={primaryDisabled} onPress={()=>{setError('');if(step===1){setProduct(productId);setStep(2);}else if(step===2)void availability(3);else if(step===3)void availability(4,true);else void submit();}} style={({pressed})=>({minHeight:52,borderRadius:12,paddingHorizontal:18,paddingVertical:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,backgroundColor:primaryDisabled?'#E4E7EC':pressed?'#0847AE':'#0758DC'})}>
        {busy&&<ActivityIndicator size="small" color="white"/>}<Text style={{fontSize:16,lineHeight:24,fontWeight:'600',textAlign:'center',flexShrink:1,color:primaryDisabled?'#667085':'white'}}>{primary}</Text>{!busy&&<ArrowRight size={20} color={primaryDisabled?'#667085':'white'}/>}
      </Pressable>
    </View>}
  </KeyboardAvoidingView>;
}

const blue = '#0758DC';
const pale = '#EAF1FD';
const booking = StyleSheet.create({
  tools:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:4,paddingHorizontal:8,backgroundColor:pale,borderRadius:12},
  utilities:{gap:5},
  tool:{minHeight:49,backgroundColor:pale,borderRadius:11,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:10},
  link:{color:blue,fontWeight:'700',fontSize:13,flexShrink:1},
  photo:{height:150,overflow:'hidden',backgroundColor:pale,alignItems:'center',justifyContent:'center'},
  productCard:{borderWidth:1,borderColor:'#DCE3EC',borderRadius:12,overflow:'hidden'},
  detailLine:{flexDirection:'row',alignItems:'center',gap:8,padding:8,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:'#DCE3EC'},
  productCopy:{padding:10,gap:4},
  summaryIcon:{backgroundColor:'#E5F3FF',padding:7,borderRadius:10},
  change:{minHeight:40,paddingHorizontal:8,justifyContent:'center',borderWidth:1,borderColor:'#DCE3EC',borderRadius:9},
  product:{fontSize:19,fontWeight:'800',color:C.text},
  price:{fontSize:18,fontWeight:'800',color:blue},
  label:{fontSize:14,fontWeight:'700',color:C.text},
  meta:{fontSize:13,color:C.text},
  muted:{fontSize:12,color:C.muted},
  typeTile:{width:"32%",minHeight:72,borderWidth:1,borderColor:C.border,borderRadius:12,alignItems:'center',justifyContent:'center',gap:5,padding:7},
  typeActive:{borderColor:blue,backgroundColor:pale},
  summary:{flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:C.border,borderRadius:10,paddingHorizontal:10,paddingVertical:6,minHeight:44},
  legend:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8},
  legendItem:{flexDirection:'row',alignItems:'center',gap:5},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:'2%',rowGap:8},
  unit:{width:'32%',minHeight:72,borderWidth:1,borderRadius:10,padding:5,alignItems:'center',justifyContent:'center',gap:3},
  pill:{flex:1,minWidth:96,minHeight:44,borderWidth:1,borderColor:C.border,borderRadius:24,alignItems:'center',justifyContent:'center',padding:6},
  stepper:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  counter:{flexDirection:'row',alignItems:'center',borderRadius:24,backgroundColor:pale},
  counterAction:{width:44,height:44,alignItems:'center',justifyContent:'center'},
});

function BookingDetail({ title, detail }: { title: string; detail: string }) {
  return <View style={booking.detailLine}>
    <View style={booking.summaryIcon}><Warehouse size={16} color={blue} /></View>
    <View style={{ flex: 1 }}>
      <Text style={booking.label}>{title}</Text>
      {detail ? <Text style={booking.muted}>{detail}</Text> : null}
    </View>
  </View>;
}

function BookingOptions({value, options, onChange}:{value:string;options:{value:string;label:string}[];onChange:(value:string)=>void}) {
  return <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{options.map(option=>{
    const active=option.value===value;
    return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{checked:active}} onPress={()=>onChange(option.value)}
      style={[booking.pill,active&&{backgroundColor:blue,borderColor:blue}]}>
      <Text style={[booking.label,{textAlign:'center'},active&&{color:'white'}]}>{option.label}</Text>
    </Pressable>;
  })}</View>;
}

function BookingStepper({label, display, index, count, onChange}:{label:string;display:string;index:number;count:number;onChange:(index:number)=>void}) {
  return <View style={booking.stepper}><Text style={booking.label}>{label}</Text><View style={booking.counter}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Giảm '+label.toLowerCase()} disabled={index<=0} onPress={()=>onChange(index-1)} style={booking.counterAction}><Minus size={17} color={index<=0?C.disabled:blue}/></Pressable>
    <Text style={[booking.label,{minWidth:36,textAlign:'center'}]}>{display}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={'Tăng '+label.toLowerCase()} disabled={index>=count-1} onPress={()=>onChange(index+1)} style={booking.counterAction}><Plus size={17} color={index>=count-1?C.disabled:blue}/></Pressable>
  </View></View>;
}

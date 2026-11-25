import { useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import { useAuth } from '../../auth/auth-context';
import { Link } from 'react-router-dom';
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
const businessTime=(value:string)=>new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const businessDateTime=(value:FormDataEntryValue|null)=>new Date(String(value)+'+07:00').toISOString();
const versionStatus:Record<string,string>={EFFECTIVE:'Đang áp dụng',SCHEDULED:'Chưa đến ngày áp dụng',HISTORICAL:'Lịch sử'};
type Facility={id:string;code:string;name:string;address:string;officeHours:string;accessHours:string;bookingEnabled:boolean;operationalStatus:string;updatedAt:string;closureMode?:string;closureReason?:string;closureExpectedAt?:string;closureProgress?:{activeContracts:number;openTasks:number;openTransfers:number;pendingBookings:number}};
type Policy={key:string;title:string;description:string;value:number;min:number;max:number;unit:string;updatedAt:string|null;effectiveVersion:number;history:{id:string;version:number;value:number;effectiveFrom:string;effectiveTo:string|null;status:string;author:string|null}[]};
export function OperationsPolicies(){
 const requestConfirmation = useConfirmation();
 const saving = useRef(false);
 const{user}=useAuth();const data=useApiResource<{items:Policy[];commercialRules:{prepaidDiscounts:{months:number;percent:number}[];depositDescription:string}}>('/operations/business-policies',user?.id);const[error,setError]=useState('');const[busy,setBusy]=useState('');
 async function save(e:FormEvent<HTMLFormElement>,p:Policy){
  e.preventDefault();
  if (saving.current) return;
  const f = new FormData(e.currentTarget);
  saving.current = true;
  try {
   const body = {value:Number(f.get('value')),expectedUpdatedAt:p.updatedAt,effectiveFrom:businessDateTime(f.get('effectiveFrom'))};
   if (!await requestConfirmation({title:'Công bố chính sách',description:`${p.title}\n${p.value} → ${body.value} ${p.unit}\nHiệu lực từ ${businessTime(body.effectiveFrom)} (UTC+7).`,confirmLabel:'Công bố'})) return;
   setBusy(p.key); setError('');
   await apiRequest('/operations/business-policies/'+p.key,{method:'PATCH',body:JSON.stringify(body)});
   data.refresh();
  } catch(err){setError(err instanceof Error?err.message:'Chưa lưu được chính sách.');}
  finally{saving.current=false;setBusy('');}
 }
 return <section className="operations-page"><h1>Chính sách thuê kho</h1>{data.loading?<p>Đang tải…</p>:null}{data.error||error?<p role="alert">{data.error||error}</p>:null}
 {(data.data?.items??[]).map(p=><form key={p.key+':'+p.updatedAt} onSubmit={e=>save(e,p)}><h2>{p.title}</h2><p>{p.description}</p><p><strong>Đang áp dụng: {p.value} {p.unit}</strong> · {p.effectiveVersion?`Phiên bản ${p.effectiveVersion}`:'Giá trị nền tảng'}</p><label>Giá trị mới ({p.unit})<input name="value" type="number" required min={p.min} max={p.max} step="1" defaultValue={p.value}/><small>Phạm vi {p.min}–{p.max} {p.unit}</small></label><label>Áp dụng từ (UTC+7)<input name="effectiveFrom" type="datetime-local" required/></label><button disabled={Boolean(busy)}>{busy===p.key?'Đang lưu…':'Kiểm tra và công bố phiên bản'}</button>
 <details open><summary>Lịch sử phiên bản ({p.history.length})</summary><div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Phiên bản</th><th>Giá trị</th><th>Hiệu lực</th><th>Người tạo</th><th>Trạng thái</th></tr></thead><tbody>{p.history.map(h=><tr key={h.id}><td>{h.version}</td><td>{h.value} {p.unit}</td><td>{businessTime(h.effectiveFrom)}{h.effectiveTo&&<small>Đến {businessTime(h.effectiveTo)}</small>}</td><td>{h.author??'—'}</td><td>{versionStatus[h.status]??h.status}</td></tr>)}</tbody></table></div></details></form>)}
 <section className="manager-section"><h2>Tiền cọc, phí và giảm giá (chỉ xem)</h2><div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Quy tắc hiện tại</th><th>Cách áp dụng</th></tr></thead><tbody><tr><td>Tiền cọc</td><td>{data.data?.commercialRules.depositDescription??'Chưa tải được'}</td></tr><tr><td>Giảm giá trả trước</td><td>{data.data?.commercialRules.prepaidDiscounts.map(d=>`${d.months} tháng: ${d.percent}%`).join('; ')??'Chưa tải được'}. Trả từng tháng không giảm theo quy tắc này.</td></tr><tr><td>Phí chuyển kho, trả sớm và các phí khác</td><td>Áp dụng theo nghiệp vụ và điều khoản hiện hành; chưa có cấu hình BOM có hiệu lực riêng.</td></tr></tbody></table></div><p>Các quy tắc thương mại này chưa hỗ trợ xuất bản phiên bản cấu hình riêng. Không thay đổi hợp đồng hoặc hóa đơn đã phát hành.</p><Link to="/operations/pricing">Xem khung giá thuê đang áp dụng</Link></section></section>;
}
type Range={id:string;facilityId:string;storageTypeId:string|null;version:number;value:{min:number;max:number};effectiveFrom:string;status:string};
type RangeType={id:string;facilityId:string;name:string;code:string;monthlyRate:number|null;outsideRange:boolean;range:{min:number;max:number}|null};
export function OperationsPricing(){
 const requestConfirmation = useConfirmation();
 const saving = useRef(false);
 const{user}=useAuth();const ranges=useApiResource<{items:Range[];types:RangeType[]}>('/operations/pricing-rules',user?.id);const facilities=useApiResource<Facility[]>('/operations/facilities',user?.id);const[error,setError]=useState('');const[busy,setBusy]=useState(false);const[facilityId,setFacilityId]=useState('');const[typeId,setTypeId]=useState('');
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if (saving.current) return;
  const f = new FormData(e.currentTarget);
  const min = Number(f.get('min')), max = Number(f.get('max'));
  if (min > max) { setError('Giá tối thiểu không thể lớn hơn giá tối đa.'); return; }
  const storageTypeId = typeId || null;
  const expectedVersion = ranges.data?.items.find(r=>r.facilityId===facilityId&&r.storageTypeId===storageTypeId)?.version ?? 0;
  const facility = facilities.data?.find(item=>item.id===facilityId);
  const scope = storageTypeId ? ranges.data?.types.find(item=>item.id===storageTypeId)?.name ?? storageTypeId : 'Toàn cơ sở';
  saving.current = true;
  try {
   const body = {facilityId,storageTypeId,min,max,effectiveFrom:businessDateTime(f.get('effectiveFrom')),expectedVersion};
   if (!await requestConfirmation({title:'Công bố khung giá',description:`${facility?.name ?? facilityId} · ${scope}\n${min.toLocaleString('vi-VN')} – ${max.toLocaleString('vi-VN')} đ/tháng\nHiệu lực từ ${businessTime(body.effectiveFrom)} (UTC+7).`,confirmLabel:'Công bố'})) return;
   setBusy(true); setError('');
   await apiRequest('/operations/pricing-rules',{method:'POST',body:JSON.stringify(body)});
   ranges.refresh();
  } catch(err){setError(err instanceof Error?err.message:'Chưa lưu được khung giá.');}
  finally{saving.current=false;setBusy(false);}
 }
 return <section className="operations-page"><h1>Khung giá thuê</h1><p>Quản lý cơ sở đặt giá bán trong khung được phép. Giá và hóa đơn đã chốt giữ nguyên.</p>
 {ranges.error||facilities.error||error?<p role="alert">{ranges.error||facilities.error||error}</p>:null}<form onSubmit={save}><label>Cơ sở<select name="facilityId" required value={facilityId} onChange={e=>{setFacilityId(e.target.value);setTypeId('');}}><option value="">Chọn cơ sở</option>{facilities.data?.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}</select></label>
 <label>Phạm vi<select value={typeId} onChange={e=>setTypeId(e.target.value)}><option value="">Mặc định toàn cơ sở</option>{ranges.data?.types.filter(t=>t.facilityId===facilityId).map(t=><option key={t.id} value={t.id}>{t.name} · {t.code}</option>)}</select></label>
 <label>Giá tháng tối thiểu<input name="min" type="number" min="0" step="1" required/></label><label>Giá tháng tối đa<input name="max" type="number" min="0" step="1" required/></label><label>Áp dụng từ (UTC+7)<input name="effectiveFrom" type="datetime-local" required/></label><button disabled={busy||ranges.loading}>{busy?'Đang lưu…':'Công bố khung giá'}</button></form>
 <h2>Giá hiện tại cần điều chỉnh</h2>{ranges.data?.types.filter(t=>t.outsideRange).length===0&&<p>Không có loại kho vượt khung giá đang áp dụng.</p>}{ranges.data?.types.filter(t=>t.outsideRange).map(t=><p key={t.id} className="booking-alert is-error">{facilities.data?.find(f=>f.id===t.facilityId)?.name} · {t.name}: {t.monthlyRate?.toLocaleString('vi-VN')} đ (khung {t.range?.min.toLocaleString('vi-VN')} – {t.range?.max.toLocaleString('vi-VN')} đ)</p>)}
 <h2>Lịch sử khung giá</h2><div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Cơ sở / Loại kho</th><th>Khung giá/tháng</th><th>Phiên bản</th><th>Hiệu lực</th><th>Trạng thái</th></tr></thead><tbody>{ranges.data?.items.map(r=><tr key={r.id}><td>{facilities.data?.find(f=>f.id===r.facilityId)?.name??'Cơ sở'}<small>{r.storageTypeId?ranges.data?.types.find(t=>t.id===r.storageTypeId)?.name:'Toàn cơ sở'}</small></td><td>{r.value.min.toLocaleString('vi-VN')} – {r.value.max.toLocaleString('vi-VN')} đ</td><td>{r.version}</td><td>{businessTime(r.effectiveFrom)}</td><td>{versionStatus[r.status]}</td></tr>)}</tbody></table></div></section>;
}
type Report={asOf:string;facilities:number;units:{status:string;_count:{_all:number}}[];contracts:{status:string;_count:{_all:number}}[];grossReceipts:string;limitations:string[]};
export function OperationsReports(){
 const{user}=useAuth();const data=useApiResource<Report>('/operations/reports',user?.id);const [exportError,setExportError]=useState('');const [exporting,setExporting]=useState(false);
 async function download(){setExporting(true);setExportError('');try{const blob=await apiRequest<Blob>('/operations/reports/invoices.csv',{responseType:'blob'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='nestbox-hoa-don.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setExportError(e instanceof Error?e.message:'Không xuất được báo cáo.');}finally{setExporting(false);}}
 const labels:Record<string,string>={AVAILABLE:'Còn trống',RESERVED:'Đang giữ chỗ',OCCUPIED:'Đang sử dụng',MAINTENANCE:'Bảo trì',PENDING_PAYMENT:'Chờ thanh toán',READY_FOR_HANDOVER:'Chờ bàn giao',ACTIVE:'Đang hoạt động',COMPLETED:'Hoàn tất',CANCELLED:'Đã hủy'};
 return <section className="operations-page"><header><h1>Báo cáo toàn hệ thống</h1><div><button onClick={data.refresh}>Cập nhật</button><button disabled={exporting} onClick={()=>void download()}>{exporting?'Đang xuất…':'Xuất hóa đơn CSV'}</button></div></header>{exportError?<p role="alert">{exportError}</p>:null}{data.loading?<p>Đang tải…</p>:null}{data.error?<p role="alert">{data.error}</p>:null}{data.data?<><p>Cập nhật {new Date(data.data.asOf).toLocaleString('vi-VN')}</p><div className="operations-row"><span>Cơ sở</span><strong>{data.data.facilities}</strong></div><div className="operations-row"><span>Tổng tiền đã thu (gồm cọc)</span><strong>{BigInt(data.data.grossReceipts).toLocaleString('vi-VN')} đ</strong></div><h2>Ô kho hiện tại</h2>{data.data.units.map(r=><div className="operations-row" key={r.status}><span>{labels[r.status]??'Trạng thái khác'}</span><strong>{r._count._all}</strong></div>)}<h2>Hợp đồng hiện tại</h2>{data.data.contracts.map(r=><div className="operations-row" key={r.status}><span>{labels[r.status]??'Trạng thái khác'}</span><strong>{r._count._all}</strong></div>)}{data.data.limitations.map(s=><p key={s}><small>{s}</small></p>)}</>:null}</section>;
}

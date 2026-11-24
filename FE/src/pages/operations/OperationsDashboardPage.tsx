import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, Boxes, CalendarDays, CircleDollarSign, WalletCards } from 'lucide-react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { PageHeader, LoadState } from '../../components/manager/PortalUi';
import './operations-dashboard.css';

type Facility = {id:string;name:string;code:string;bookingEnabled:boolean;operationalStatus:string;units:{total:number;occupied:number;available:number;reserved:number;maintenance:number};activeContracts:number;newReservations:number;handovers:number;returns:number;rent:string;received:string;debt:string};
type Dashboard = {asOf:string;items:Facility[]};
type Trend = {asOf:string;group:string;items:{date:string;billed:string;received:string}[]};
type Period = 'month'|'previous'|'quarter'|'year'|'all'|'custom';
const periods: [Period,string][] = [['month','Tháng này'],['previous','Tháng trước'],['quarter','3 tháng gần đây'],['year','Năm nay'],['all','Tất cả thời gian'],['custom','Tùy chỉnh']];
const number = new Intl.NumberFormat('vi-VN');
const money = (value:bigint|string) => BigInt(value).toLocaleString('vi-VN')+' đ';
const day = (value:string) => value.split('-').reverse().join('/');
const iso = (d:Date) => d.toISOString().slice(0,10);
const pct = (count:number,total:number) => total ? `${new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(count/total*100)}%` : '—';
function dashboardPeriod(period:Period, now=new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).formatToParts(now);
  const year = Number(parts.find(part=>part.type==='year')?.value);
  const month = Number(parts.find(part=>part.type==='month')?.value);
  const start = (offset:number) => iso(new Date(Date.UTC(year,month-1+offset,1)));
  const end = (offset:number) => iso(new Date(Date.UTC(year,month+offset,0)));
  if(period==='all')return {from:'',to:''};
  if(period==='previous')return {from:start(-1),to:end(-1)};
  if(period==='quarter')return {from:start(-2),to:end(0)};
  if(period==='year')return {from:`${year}-01-01`,to:`${year}-12-31`};
  return {from:start(0),to:end(0)};
}
function trendGroup(from:string,to:string){if(!from||!to)return 'month';const days=(Date.parse(to)-Date.parse(from))/86400000+1;return days<=35?'day':days<=120?'week':days<=1096?'month':'year';}
const statusItems = [{key:'available',label:'Kho trống',color:'available'},{key:'occupied',label:'Đang sử dụng',color:'occupied'},{key:'reserved',label:'Đang giữ chỗ',color:'reserved'},{key:'maintenance',label:'Đang bảo trì',color:'maintenance'}] as const;

function Skeleton({className=''}:{className?:string}) {return <div className={`bom-dash-skeleton ${className}`} aria-hidden="true"/>;}
function TrendChart({data}:{data:Trend}){
  if(!data.items.length)return <p className="bom-dash-empty">Chưa có giao dịch tài chính trong kỳ đã chọn.</p>;
  const max=data.items.reduce((m,p)=>[BigInt(p.billed),BigInt(p.received)].reduce((a,b)=>a>b?a:b,m),0n);
  const scale=max>0n?max:1n;
  const barHeight=(value:string)=>`${Number(BigInt(value)*10000n/scale)/100}%`;
  const axis=(v:bigint)=>v>=1000000000n?`${number.format(Number(v/100000000n)/10)} tỷ`:v>=1000000n?`${number.format(Number(v/100000n)/10)} tr`:v>=1000n?`${number.format(Number(v/1000n))} nghìn`:number.format(Number(v));
  const label=(date:string)=>date.length===10?`${date.slice(8,10)}/${date.slice(5,7)}`:date.length===7?`${date.slice(5,7)}/${date.slice(0,4)}`:date;
  return <><div className="bom-dash-legend chart-legend"><span><i className="billed"/>Tiền thuê và dịch vụ lập hóa đơn</span><span><i className="received"/>Tiền thực thu (gồm cọc)</span></div><div className="bom-trend-chart"><div className="bom-trend-axis" aria-label="Đơn vị VND">{[4n,3n,2n,1n,0n].map(i=><span key={String(i)}>{axis(max*i/4n)}</span>)}</div><div className="bom-trend-scroll"><div className="bom-trend-plot" style={{gridTemplateColumns:`repeat(${data.items.length},minmax(${data.items.length>12?36:52}px,1fr))`}}>{data.items.map(p=><div className="bom-trend-group" key={p.date} tabIndex={0} aria-label={`${p.date}: lập hóa đơn ${money(p.billed)}, thực thu ${money(p.received)}`}><div className="bom-trend-bars"><span className="billed" style={{height:barHeight(p.billed)}}/><span className="received" style={{height:barHeight(p.received)}}/></div><span className="bom-trend-label">{label(p.date)}</span><div className="bom-trend-tooltip" role="tooltip"><strong>{p.date}</strong><span>Lập hóa đơn: {money(p.billed)}</span><span>Thực thu: {money(p.received)}</span></div></div>)}</div></div></div><small>{data.group==='day'?'Theo ngày':data.group==='week'?'Theo tuần (ngày bắt đầu tuần)':data.group==='year'?'Theo năm':'Theo tháng'} · VND · Chỉ hiển thị kỳ có phát sinh hóa đơn hoặc khoản thu.</small></>;
}

export function OperationsDashboardPage(){
 const {user}=useAuth();const [params,setParams]=useSearchParams();const initial=dashboardPeriod('month');
 const [period,setPeriod]=useState<Period>(()=>params.has('from')||params.has('to')?'custom':'month');
 const [customFrom,setCustomFrom]=useState(params.get('from')??initial.from),[customTo,setCustomTo]=useState(params.get('to')??initial.to);
 const facilityId=params.get('facilityId')??'';
 const dates=period==='custom'?{from:customFrom,to:customTo}:dashboardPeriod(period);
 const valid=period!=='custom'||!!dates.from&&!!dates.to&&dates.from<=dates.to;
 const query=new URLSearchParams({...(facilityId?{facilityId}:{}),...(dates.from?{from:dates.from}:{}),...(dates.to?{to:dates.to}:{})}).toString();
 const group=trendGroup(dates.from,dates.to);
 const facilities=useApiResource<Pick<Facility,'id'|'name'>[]>('/operations/facilities',user?.id,true);
 const summary=useApiResource<Dashboard>(valid?`/operations/dashboard${query?'?'+query:''}`:null,user?.id,true);
 const trend=useApiResource<Trend>(valid?`/operations/dashboard/trend?${new URLSearchParams({...Object.fromEntries(new URLSearchParams(query)),group})}`:null,user?.id,true);
 const rows=summary.data?.items??[];
 const sumCount=(key:'activeContracts'|'newReservations'|'handovers'|'returns')=>rows.reduce((n,r)=>n+r[key],0);
 const sumMoney=(key:'rent'|'debt'|'received')=>rows.reduce((n,r)=>n+BigInt(r[key]),0n);
 const units=rows.reduce((n,r)=>n+r.units.total,0),occupied=rows.reduce((n,r)=>n+r.units.occupied,0),distribution=statusItems.map(s=>({...s,count:rows.reduce((n,r)=>n+r.units[s.key],0)}));
 const other=units-distribution.reduce((n,s)=>n+s.count,0);
 const segments=[...distribution,...(other>0?[{key:'other',label:'Trạng thái khác',color:'other',count:other}]:[])];
 let position=0;const gradient=segments.filter(s=>s.count>0).map(s=>{const begin=position;position+=s.count/units*100;return `var(--bom-${s.color}) ${begin}% ${position}%`;}).join(',');
 const metrics=[{label:'Cơ sở đang hoạt động',value:number.format(rows.filter(r=>r.operationalStatus==='OPEN').length),hint:`${number.format(rows.length)} cơ sở trong phạm vi · hiện tại`,icon:Building2},{label:'Tỷ lệ lấp đầy hiện tại',value:pct(occupied,units),hint:`${number.format(occupied)}/${number.format(units)} ô kho đang sử dụng`,icon:Boxes},{label:'Tiền thực thu trong kỳ',value:money(sumMoney('received')),hint:'Bao gồm tiền cọc',icon:CircleDollarSign},{label:'Công nợ hiện tại',value:money(sumMoney('debt')),hint:'Số dư hóa đơn còn hiệu lực',icon:WalletCards}];
 return <section className="operations-page bom-dashboard"><PageHeader title="Tổng quan kinh doanh" description="Theo dõi tình hình kinh doanh và hiệu quả hoạt động của các cơ sở NestBox."/>
 <div className="bom-dash-filters"><label>Cơ sở<select value={facilityId} disabled={facilities.loading} onChange={e=>setParams(old=>{const next=new URLSearchParams(old);if(e.target.value)next.set('facilityId',e.target.value);else next.delete('facilityId');return next;},{replace:true})}><option value="">Tất cả cơ sở</option>{facilities.data?.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>Kỳ báo cáo<select value={period} onChange={e=>setPeriod(e.target.value as Period)}>{periods.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{period==='custom'&&<><label>Từ ngày<input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></label><label>Đến ngày<input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></label></>}<div className="bom-dash-period"><CalendarDays size={15}/><span>{valid?(dates.from&&dates.to?`${day(dates.from)} – ${day(dates.to)}`:'Tất cả thời gian'):'Chọn khoảng ngày hợp lệ'} · UTC+7{summary.data&&<small>Cập nhật {new Date(summary.data.asOf).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small>}</span></div></div>
 {facilities.error&&<LoadState loading={false} error={facilities.error} retry={facilities.refresh}/>}{!valid&&<p className="booking-alert is-error" role="alert">Ngày bắt đầu không được sau ngày kết thúc. Chọn đủ hai ngày.</p>}
 {valid&&<><LoadState loading={false} error={summary.error} retry={summary.refresh}/>{summary.loading?<div className="bom-dash-kpis" aria-label="Đang tải chỉ số">{Array.from({length:4},(_,i)=><Skeleton key={i} className="kpi"/>)}</div>:summary.data&&<div className="bom-dash-kpis">{metrics.map(({label,value,hint,icon:Icon})=><article className="bom-dash-kpi" key={label}><div><span>{label}</span><Icon size={19} aria-hidden="true"/></div><strong>{value}</strong><small>{hint}</small></article>)}</div>}
 <div className="bom-dash-charts"><section className="bom-dash-panel"><h2>Xu hướng kinh doanh</h2>{trend.loading?<Skeleton className="chart"/>:trend.error?<LoadState loading={false} error={trend.error} retry={trend.refresh}/>:trend.data&&<TrendChart data={trend.data}/>}</section><section className="bom-dash-panel"><h2>Tình trạng ô kho hiện tại</h2>{summary.loading?<Skeleton className="chart"/>:summary.data?(units?<><div className="bom-donut" style={{background:`conic-gradient(${gradient})`}} role="img" aria-label={`Tổng ${units} ô kho, ${segments.map(s=>`${s.label}: ${s.count}`).join(', ')}`}><div><strong>{number.format(units)}</strong><small>Tổng ô kho</small></div></div><div className="bom-dash-legend status-legend">{segments.map(s=><span key={s.key}><i className={s.color}/><span>{s.label}</span><strong>{number.format(s.count)}</strong></span>)}</div></>:<p className="bom-dash-empty">Chưa có ô kho trong phạm vi đã chọn.</p>):<p className="bom-dash-empty">Không tải được tình trạng ô kho.</p>}</section></div>
 <section className="bom-dash-panel"><h2>Hoạt động cho thuê</h2>{summary.loading?<Skeleton className="activity"/>:summary.data?<><div className="bom-dash-activity">{([['Đơn đặt kho mới','newReservations','Trong kỳ'],['Hợp đồng đang hoạt động','activeContracts','Hiện tại'],['Bàn giao hoàn tất','handovers','Trong kỳ'],['Trả kho hoàn tất','returns','Trong kỳ']] as const).map(([label,key,hint])=><div key={key}><span>{label}</span><strong>{number.format(sumCount(key))}</strong><small>{hint}</small></div>)}</div>{sumCount('newReservations')+sumCount('handovers')+sumCount('returns')===0&&<small>Chưa có hoạt động mới trong kỳ.</small>}</>:<p className="bom-dash-empty">Không tải được hoạt động cho thuê.</p>}</section>
 <section className="bom-dash-panel"><header><h2>Hiệu quả cơ sở</h2><Link className="bom-dash-report-link" to={`/operations/reports${query?'?'+query:''}`}>Xem báo cáo chi tiết <ArrowRight size={16}/></Link></header>{summary.loading?<Skeleton className="table"/>:summary.data?(rows.length?<><div className="manager-table-wrap"><table className="manager-table bom-dash-table"><thead><tr><th>Cơ sở</th><th>Ô kho đang sử dụng</th><th>Tỷ lệ lấp đầy</th><th>Tiền thuê lập hóa đơn trong kỳ</th><th>Trạng thái</th></tr></thead><tbody>{rows.slice(0,6).map(r=><tr key={r.id}><td><strong>{r.name}</strong><small>{r.code}</small></td><td>{number.format(r.units.occupied)}/{number.format(r.units.total)}</td><td><div className="bom-dash-progress"><progress max={r.units.total||1} value={r.units.occupied} aria-label={`Tỷ lệ lấp đầy ${r.name}`}/><span>{pct(r.units.occupied,r.units.total)}</span></div></td><td>{money(r.rent)}</td><td><span className={`bom-dash-status ${r.operationalStatus==='CLOSED'?'closed':r.bookingEnabled?'open':'paused'}`}>{r.operationalStatus==='CLOSED'?'Đóng cửa':r.bookingEnabled?'Đang nhận đặt kho':'Tạm dừng đặt kho'}</span></td></tr>)}</tbody></table></div>{rows.length>6&&<small>Hiển thị 6/{rows.length} cơ sở; xem báo cáo để tra cứu đầy đủ.</small>}</>:<p className="bom-dash-empty">Chưa có cơ sở trong phạm vi đã chọn.</p>):<p className="bom-dash-empty">Không tải được hiệu quả cơ sở.</p>}</section></>}
 </section>;
}

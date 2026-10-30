import { useId, useState } from 'react';
import type { CustomerContract } from '../../types/customer';
import { normalizeRentalSearch, rentalChoice } from '../../utils/rental-choice';

export function RentalChoicePicker({ contracts, value, onChange, disabled=false }: {contracts:CustomerContract[];value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const [search,setSearch]=useState('');
  const group=useId(), choices=contracts.filter(row=>row.status==='ACTIVE').map(rentalChoice);
  const shown=choices.filter(row=>row.search.includes(normalizeRentalSearch(search))), selected=choices.find(row=>row.id===value);
  if (!choices.length) return null;
  return <fieldset className="rental-choice-picker" disabled={disabled} aria-describedby={group+'-help'}>
    <legend>Bạn muốn gửi/lấy hàng ở kho nào?</legend>
    <p id={group+'-help'}>Chọn đúng kho đang thuê. Mỗi phiếu áp dụng cho một kho; không cần nhớ mã hợp đồng.</p>
    {choices.length>1 && <label className="field-label">Tìm kho đang thuê<input type="search" value={search} maxLength={150} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}} onChange={event=>setSearch(event.target.value)} placeholder="Tên kho, mã kho hoặc mã hợp đồng" /></label>}
    <p className="rental-choice-count" role="status">{shown.length} / {choices.length} kho đang thuê</p>
    <div className="rental-choice-grid">{shown.map(row=><label key={row.id} className={`rental-choice-card${row.id===value?' is-selected':''}`}>
      <input type="radio" name={group} value={row.id} checked={row.id===value} required onChange={()=>onChange(row.id)} aria-label={row.label} />
      <span className="rental-choice-content"><span className="rental-choice-heading"><strong>{row.unitCode}</strong>{row.id===value && <small>Đã chọn</small>}</span><b>{row.name}</b><span>{[row.condition,row.location].filter(Boolean).join(' · ') || 'Vị trí chưa cập nhật'}</span>{row.period && <span>Thời gian thuê: {row.period}</span>}<small>Hợp đồng: {row.code || 'Chưa có mã'}</small></span>
    </label>)}</div>
    {!shown.length && <p>Không tìm thấy kho phù hợp. <button type="button" className="portal-text-button" onClick={()=>setSearch('')}>Hiện tất cả kho</button></p>}
    {selected && <p className="rental-choice-confirm" role="status">Phiếu sẽ gửi cho <strong>{selected.unitCode} · {selected.name}</strong>.{search && !shown.some(row=>row.id===value) && <button type="button" className="portal-text-button" onClick={()=>setSearch('')}>Xem kho đã chọn</button>}</p>}
    {value && <p className="field-help">Đổi kho sẽ làm mới các dòng hàng để tránh gửi nhầm kho.</p>}
  </fieldset>;
}

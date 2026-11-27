import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../../auth/auth-context';
import { allPages } from '../../services/portal';

type TaskContext={kind:string;id:string};
export function StaffPicker({value,onChange,disabled=false,workloads,list=false,dropdown=false,task}:{
 value:string;onChange:(value:string)=>void;disabled?:boolean;workloads?:Map<string,number>;list?:boolean;dropdown?:boolean;task?:TaskContext;
 knownStaff?:Map<string,string>;currentStaff?:{id:string;fullName:string;email?:string}|null;
}){
 const {user}=useAuth();const name=useId();
 const picker = useRef<HTMLDetailsElement>(null);
 const searchInput = useRef<HTMLInputElement>(null);
 const [revision,setRevision]=useState(0),[search,setSearch]=useState('');
 const [result,setResult]=useState<{key:string;items:{id:string;fullName:string;email?:string}[];error:string}>();
 const query=new URLSearchParams({limit:'100',...(task?{taskType:task.kind,taskId:task.id}:{})}).toString();
 const key=user?.id+':'+query+':'+revision;
 useEffect(()=>{
  if(user?.role!=='FACILITY_MANAGER')return;
  const controller=new AbortController();
  allPages<{id:string;fullName:string;email?:string}>('/manager/staff?'+query,controller.signal)
   .then(page=>{if(!controller.signal.aborted)setResult({key,items:page.items,error:''});})
   .catch(error=>{if(!controller.signal.aborted)setResult({key,items:[],error:error instanceof Error?error.message:'Chưa tải được nhân viên.'});});
  return ()=>controller.abort();
 },[key,query,user?.role]);
 const current=result?.key===key?result:undefined;
 useEffect(()=>{if(current&&!current.error&&value&&!current.items.some(s=>s.id===value))onChange('');},[current,value,onChange]);
 const term=search.trim().toLocaleLowerCase('vi');
 const items=(current?.items??[]).filter(s=>(s.fullName+' '+s.email).toLocaleLowerCase('vi').includes(term))
  .sort((a,b)=>(workloads?(workloads.get(a.id)??0)-(workloads.get(b.id)??0):0)||a.fullName.localeCompare(b.fullName,'vi'));
 return <div className="staff-assignee-picker">
  {!current?<p role="status">Đang tải nhân viên thuộc cơ sở…</p>:current.error?<p role="alert">{current.error} <button type="button" disabled={disabled} onClick={()=>setRevision(n=>n+1)}>Thử lại</button></p>:!current.items.length?<p>Chưa có nhân viên được cấp quyền tại cơ sở.{!dropdown && ' Nhiệm vụ sẽ nằm trong hàng chờ phân công.'}</p>:<>
   {dropdown ? <details className="transfer-staff-picker" ref={picker} onToggle={event => { if (event.currentTarget.open) searchInput.current?.focus(); }}
      onKeyDown={event => { if (event.key === 'Escape' && picker.current?.open) { picker.current.open = false; picker.current.querySelector('summary')?.focus(); } }}>
      <summary aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}>{current.items.find(staff => staff.id === value)?.fullName || 'Chọn nhân viên'} <ChevronDown size={16} /></summary>
      <div className="transfer-staff-options"><input ref={searchInput} aria-label="Tìm nhân viên" type="search" value={search} disabled={disabled} placeholder="Tên hoặc email" onChange={event => setSearch(event.target.value)} />
        <button type="button" disabled={disabled} onClick={() => { onChange(''); if (picker.current) { picker.current.open = false; picker.current.querySelector('summary')?.focus(); } }}>Chưa chọn nhân viên</button>
        {items.map(staff => <button type="button" key={staff.id} disabled={disabled} aria-pressed={staff.id === value} onClick={() => { onChange(staff.id); if (picker.current) { picker.current.open = false; picker.current.querySelector('summary')?.focus(); } }}>
          <span aria-hidden="true">{staff.fullName.trim().split(/\s+/).slice(-2).map(part => part[0]).join('')}</span><span><strong>{staff.fullName}</strong>{staff.email && <small>{staff.email}</small>}</span>
        </button>)}{!items.length && <p>Không có nhân viên khớp tìm kiếm.</p>}
      </div>
    </details> : list?<><label className="field-label">Tìm nhân viên<input type="search" value={search} disabled={disabled} placeholder="Tên hoặc email" onChange={e=>setSearch(e.target.value)}/></label>
    <fieldset className="assignment-staff-list" disabled={disabled}><legend>Chọn nhân viên thực hiện</legend>
     {items.map(s=><label className="assignment-staff-option" key={s.id}><input type="radio" name={name} value={s.id} checked={value===s.id} onChange={()=>onChange(s.id)}/><span><strong>{s.fullName}</strong>{s.email?<small>{s.email}</small>:null}</span>{workloads?<small>{workloads.get(s.id)??0} việc</small>:null}</label>)}
    </fieldset>{!items.length?<p>Không có nhân viên khớp tìm kiếm.</p>:null}</>:<label className="field-label">Nhân viên<select value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">Chọn nhân viên</option>{items.map(s=><option value={s.id} key={s.id}>{s.fullName}</option>)}</select></label>}
  </>}
 </div>;
}

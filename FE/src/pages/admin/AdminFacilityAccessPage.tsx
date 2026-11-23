import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { apiRequest } from '../../services/api';
import '../operations/operations.css';
type Data={facilities:{id:string;name:string}[];users:{id:string;fullName:string;role:string}[];items:{id:string;user:{fullName:string};facility:{name:string};grantedAt:string}[]};
export function AdminFacilityAccessPage(){
 const {user}=useAuth();const data=useApiResource<Data>('/admin/facility-access',user?.id);const[error,setError]=useState('');const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
 async function run(path:string,method:'POST'|'PATCH',body:unknown){setBusy(true);setError('');setMessage('');try{await apiRequest(path,{method,body:JSON.stringify(body)});setMessage('Đã cập nhật quyền cơ sở.');data.refresh();}catch(err){setError(err instanceof Error?err.message:'Chưa cập nhật được quyền.');}finally{setBusy(false);}}
 function grant(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void run('/admin/facility-access','POST',{userId:f.get('userId'),facilityId:f.get('facilityId')});}
 return <section className="operations-page"><h1>Quyền cơ sở</h1><p>Cấp quyền vào cơ sở cho Staff và Manager. Việc giao công việc do Manager thực hiện riêng.</p>
 {data.loading?<p>Đang tải…</p>:null}{data.error||error?<p role="alert">{data.error||error}</p>:null}{message?<p role="status">{message}</p>:null}
 <form onSubmit={grant}><label>Tài khoản<select name="userId" required><option value="">Chọn nhân viên hoặc quản lý</option>{data.data?.users.map(u=><option key={u.id} value={u.id}>{u.fullName} · {u.role==='FACILITY_MANAGER'?'Quản lý':'Nhân viên'}</option>)}</select></label><label>Cơ sở<select name="facilityId" required><option value="">Chọn cơ sở</option>{data.data?.facilities.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}</select></label><button disabled={busy||data.loading}>Cấp quyền cơ sở</button></form>
 {data.data?.items.map(r=><div className="operations-row" key={r.id}><div><strong>{r.user.fullName}</strong><p>{r.facility.name}</p><small>Cấp ngày {new Date(r.grantedAt).toLocaleDateString('vi-VN')}</small></div><button disabled={busy} onClick={()=>{if(window.confirm('Thu hồi quyền cơ sở? Các phiên đăng nhập của tài khoản sẽ kết thúc.'))void run('/admin/facility-access/'+encodeURIComponent(r.id)+'/revoke','PATCH',{});}}>Thu hồi</button></div>)}
 {data.data&&!data.data.items.length?<p>Chưa có tài khoản được cấp quyền cơ sở.</p>:null}</section>;
}

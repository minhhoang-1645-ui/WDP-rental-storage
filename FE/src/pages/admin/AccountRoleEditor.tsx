import { useState } from 'react';
import { apiRequest } from '../../services/api';
const labels:Record<string,string>={FACILITY_STAFF:'Nhân viên cơ sở',FACILITY_MANAGER:'Quản lý cơ sở',BUSINESS_OPERATIONS_MANAGER:'Điều hành kinh doanh'};
export function AccountRoleEditor({id,currentRole,onSaved}:{id:string;currentRole:string;onSaved:()=>void}){
 const [role,setRole]=useState(currentRole);const[error,setError]=useState('');const[busy,setBusy]=useState(false);const[success,setSuccess]=useState('');
 if(!Object.hasOwn(labels,currentRole))return null;
 async function save(){if(role===currentRole||!window.confirm('Đổi vai trò tài khoản? Các phiên đăng nhập sẽ kết thúc.'))return;setBusy(true);setError('');setSuccess('');try{await apiRequest('/admin/facility-access/users/'+encodeURIComponent(id)+'/role',{method:'PATCH',body:JSON.stringify({role})});setSuccess('Đã đổi vai trò. Hãy cấp lại quyền cơ sở phù hợp nếu cần.');onSaved();}catch(err){setError(err instanceof Error?err.message:'Không đổi được vai trò.');}finally{setBusy(false);}}
 return <div><h3>Thay đổi vai trò nội bộ</h3><p>Cần phân công lại công việc và thu hồi quyền cơ sở cũ trước khi đổi.</p><select aria-label="Vai trò mới" value={role} onChange={e=>setRole(e.target.value)} disabled={busy}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button disabled={busy||role===currentRole} onClick={()=>void save()}>{busy?'Đang cập nhật…':'Đổi vai trò'}</button>{error?<p role="alert">{error}</p>:null}{success?<p role="status">{success}</p>:null}</div>;
}

import { apiRequest } from './api';

/** Browser PDF reader uses authenticated bytes, never a public bearer-token URL. */
export async function openDocument(path:string,name:string){
  const reader=window.open('about:blank','_blank');
  try{const bytes=await apiRequest<Uint8Array>(path,{responseType:'bytes'});if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('Máy chủ chưa trả về PDF hợp lệ.');const buffer=new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);const url=URL.createObjectURL(new Blob([buffer],{type:'application/pdf'}));if(reader)reader.location.href=url;else{const link=document.createElement('a');link.href=url;link.download=name.replace(/[^A-Za-z0-9._-]/g,'_')+'.pdf';link.click();}setTimeout(()=>URL.revokeObjectURL(url),600000);}catch(error){reader?.close();throw error;}
}

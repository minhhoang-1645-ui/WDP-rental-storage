import { useEffect, useState } from 'react';
import { apiRequest } from '@/services/api';
import { object, rows, type Row } from '@/operations/model';
import type { ServiceSelection } from '@/types/additional-service';

export function useServiceQuote(input: Row, selections: ServiceSelection[], enabled = true) {
  const key=JSON.stringify({...input,services:selections});
  const [revision,setRevision]=useState(0);
  const [result,setResult]=useState<{key:string;revision:number;quote?:Row;error?:string}>();
  useEffect(()=>{
    if(!enabled||!selections.length)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      apiRequest<Row>('/booking/availability',{method:'POST',authenticated:false,body:key,signal:controller.signal}).then(response=>{
        if(controller.signal.aborted)return;
        const quote=object(response.quote);
        if(!Array.isArray(quote.services)||typeof quote.addOnTotalAmount!=='number')throw new Error('Chưa lấy được giá thiết bị. Vui lòng thử lại.');
        setResult({key,revision,quote});
      }).catch(error=>{if(!controller.signal.aborted)setResult({key,revision,error:error instanceof Error?error.message:'Chưa lấy được báo giá.'});});
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[key,revision,enabled,selections.length]);
  const current=result?.key===key&&result.revision===revision?result:undefined;
  return {quote:current?.quote,error:current?.error,loading:enabled&&selections.length>0&&!current,retry:()=>setRevision(value=>value+1),
    amount:(id:string)=>{const value=rows(current?.quote?.services).find(row=>(row.serviceId??row.id)===id)?.amount;return typeof value==='number'&&Number.isFinite(value)?value:undefined;}};
}

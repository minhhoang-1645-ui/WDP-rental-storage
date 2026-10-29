import { documentLabels, documentText } from '../../utils/document-display';
import { QuoteBreakdown } from '../booking/QuoteBreakdown';
import { serviceDisplayName } from '../../utils/service-labels';
import type { PricingEstimate } from '../../types/booking';

function Fields({ value, field = '' }: { value: unknown; field?: string }) {
 if (Array.isArray(value)) return value.length ? <ol>{value.map((item,index)=><li key={index}><Fields value={item} /></li>)}</ol> : <span>Không có</span>;
 if (value && typeof value==='object') {
  const row=value as Record<string,unknown>;
  if (Array.isArray(row.lineItems) && ('grandTotal' in row || 'quotedTotalAmount' in row)) return <QuoteBreakdown quote={row as unknown as PricingEstimate} />;
  return <dl>{Object.entries(row).filter(([key,item])=>item!==null && item!==undefined && !['storageTypeId','serviceId'].includes(key)).map(([key,item])=><div key={key}><dt>{documentLabels[key]??key}</dt><dd><Fields field={key} value={key==='name'&&typeof item==='string'?serviceDisplayName(String(row.code??''),item):item} /></dd></div>)}</dl>;
 }
 return <span>{documentText(field,value)}</span>;
}
export function DocumentSnapshot({ value }: {value:unknown}) { return <section className="customer-panel"><h3>Thông tin xác nhận</h3><Fields value={value} /></section>; }

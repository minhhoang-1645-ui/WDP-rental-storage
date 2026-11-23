import { ConflictException } from '@nestjs/common';
type InvoiceState={type:string;status:string;amountPaid?:bigint;balanceDue?:bigint;reservation:{status:string;expiresAt?:Date|null}};
export function initialPaymentWindowClosed(invoice:InvoiceState, now=new Date()) {
 return invoice.type==='INITIAL' && (invoice.reservation.status!=='CONFIRMED' ||
   (BigInt(invoice.amountPaid??0n)===0n && !!invoice.reservation.expiresAt && invoice.reservation.expiresAt<=now));
}
export function assertInvoiceReceivable(invoice:InvoiceState) {
 if(invoice.status==='VOID'||initialPaymentWindowClosed(invoice))throw new ConflictException({code:'INVOICE_NOT_PAYABLE',message:'Hóa đơn hoặc thời hạn giữ kho không còn hiệu lực. Khoản tiền đã chuyển cần được đối soát.'});
}

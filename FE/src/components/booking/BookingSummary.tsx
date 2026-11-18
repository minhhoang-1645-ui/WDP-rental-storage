import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AvailabilityResult, BookingDraft, PricingQuote } from '../../types/booking';
import type { StorageListing } from '../../types/storage';
import { quotePaymentSummary, quotePeriod } from '../../utils/quote-payment-summary';
import { StorageImage } from '../public/StorageImage';
import { QuoteBreakdown } from './QuoteBreakdown';

export type QuoteState = 'idle' | 'loading' | 'ready' | 'error';
export type AvailabilityState = 'idle' | 'checking' | 'available' | 'unavailable' | 'error';

export function AvailabilityNotice({ state, result, error, quantity, changed, onDates, onStorage, onQuantity, onRetry }: {
  state: AvailabilityState;
  result: AvailabilityResult | null;
  error: string;
  quantity: number;
  changed: boolean;
  onDates: () => void;
  onStorage: () => void;
  onQuantity: (quantity: number) => void;
  onRetry: () => void;
}) {
  if (state === 'idle') return null;
  if (state === 'checking') return <p className="booking-availability" role="status"><LoaderCircle className="availability-spinner" size={17} aria-hidden="true" /> Đang kiểm tra kho trống…</p>;
  if (state === 'available') return <p className="booking-availability is-success" role="status"><CheckCircle2 size={17} aria-hidden="true" /> {result?.availableQuantity !== undefined ? `Còn ${result.availableQuantity} kho phù hợp · kết quả chưa giữ kho` : 'Còn kho phù hợp · kết quả chưa giữ kho'}</p>;

  const count = result?.availableQuantity;
  const fewer = typeof count === 'number' && Number.isSafeInteger(count) && count > 0 && count < quantity ? count : null;
  const title = state === 'error' ? 'Không thể kiểm tra kho lúc này.'
    : changed ? 'Kho trống vừa thay đổi.'
    : fewer ? `Chỉ còn ${fewer} kho phù hợp với thời gian đã chọn.`
    : result?.reasonCode === 'CONFLICT' ? 'Không đủ kho cho toàn bộ thời gian đã chọn.'
    : result?.reasonCode === 'OCCUPIED' ? 'Các kho loại này đang có khách sử dụng.'
    : count === 0 ? 'Hiện chưa có kho phù hợp.'
    : 'Hiện chưa có đủ kho phù hợp.';
  const detail = state === 'error' ? error
    : changed && fewer ? `Hiện còn ${fewer} kho phù hợp.`
    : result?.reasonCode === 'CONFLICT' ? 'Có lịch thuê hoặc giữ kho trùng một phần thời gian.'
    : !fewer ? 'Bạn có thể đổi ngày thuê hoặc chọn loại kho khác.' : undefined;

  return <div className="booking-availability is-unavailable" role="alert">
    <AlertCircle size={17} aria-hidden="true" />
    <div>
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      <div className="booking-recovery">
        {state === 'error' ? <button type="button" className="button-secondary" onClick={onRetry}>Thử kiểm tra lại</button> : <>
          {fewer && <button type="button" className="button-secondary" onClick={() => onQuantity(fewer)}>Giảm còn {fewer} kho</button>}
          <button type="button" className="booking-back" onClick={onDates}>Đổi thời gian</button>
          <button type="button" className="booking-back" onClick={onStorage}>Chọn kho khác</button>
          {changed && <button type="button" className="booking-back" onClick={onRetry}>Kiểm tra lại</button>}
        </>}
      </div>
    </div>
  </div>;
}

export function BookingSummary({ product, draft, endDate, services, quote, quoteState, quoteError, availabilityState, onRetry, onRemoveService, children }: {
  product: Pick<StorageListing, 'name' | 'image'>;
  draft: BookingDraft;
  endDate: string;
  services: Array<{ name: string; quantity: number; id: string }>;
  quote: PricingQuote | null;
  quoteState: QuoteState;
  quoteError: string;
  availabilityState: AvailabilityState;
  onRetry: () => void;
  onRemoveService?: (id: string) => void;
  children?: ReactNode;
}) {
  const period = quotePeriod(quote?.startDate ?? draft.startDate, quote?.endDate ?? endDate);
  const term = quote?.billingMode === 'DAILY' && quote.billableDays ? `${quote.billableDays} ngày`
    : quote?.termMonths ? `${quote.termMonths} tháng` : draft.periodMode === 'duration' && draft.durationMonths ? `${draft.durationMonths} tháng` : '';

  return <aside className="booking-summary booking-order-summary" id="booking-order-summary" aria-labelledby="booking-order-title">
    <h3 id="booking-order-title">Tóm tắt đơn thuê</h3>
    <div className="booking-summary-product">
      <StorageImage className="booking-product-thumb" src={product.image} alt="" />
      <div>
        <strong>{draft.quantity} kho · {product.name}</strong>
        {term && <small>{term}</small>}
        {period && <small>{period}</small>}
      </div>
    </div>
    <p className="booking-order-plan">{quote ? quotePaymentSummary(quote).plan : draft.paymentPlan === 'PREPAID' ? 'Trả trước cả kỳ' : 'Trả hàng tháng'}</p>
    {services.length > 0 && <ul className="booking-selected-services" aria-label="Dịch vụ đã chọn">
      {services.map(service => <li key={service.id}>
        <span>{service.quantity} × {service.name}</span>
        {onRemoveService && <button type="button" aria-label={`Bỏ ${service.name}`} onClick={() => onRemoveService(service.id)}><X size={15} aria-hidden="true" /></button>}
      </li>)}
    </ul>}
    {quote ? <QuoteBreakdown quote={quote} /> : quoteState === 'error' && availabilityState === 'available'
      ? <div className="booking-availability is-unavailable" role="alert"><AlertCircle size={17} aria-hidden="true" /><div>
        <strong>Chưa có báo giá</strong><p>{quoteError}</p><button type="button" className="booking-back" onClick={onRetry}>Thử lại báo giá</button>
      </div></div>
      : availabilityState === 'available' ? <p className="booking-quote-muted" role="status">Đang tính báo giá…</p>
      : availabilityState === 'idle' ? <p className="booking-quote-muted">Chọn thời gian thuê để xem báo giá.</p> : null}
    {children}
  </aside>;
}

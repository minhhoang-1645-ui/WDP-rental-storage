import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Info, LoaderCircle, Minus, Plus, RotateCcw, Snowflake, UserRound, Warehouse, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { StorageIllustration } from '../../components/booking/StorageIllustration'
import { AdditionalServicePicker } from '../../components/booking/AdditionalServicePicker'
import { Container } from '../../components/ui/Container'
import { bookingAvailabilityFingerprint, clearBookingAvailability, clearBookingDraft, readBookingAvailability, readBookingDraft, readBookingStep, saveBookingAvailability, saveBookingDraft, saveBookingStep } from '../../data/booking'
import { useCatalog } from '../../catalog/catalog-context'
import { ApiError } from '../../services/api'
import { bookingApi } from '../../services/booking'
import { guestBookingApi } from '../../services/guest-booking'
import type { AvailabilityResult, BookingDraft, GuestContact, GuestInquiry, PendingReservation, PricingQuote } from '../../types/booking'

const steps = [['01', 'Chọn kho'], ['02', 'Thời gian & dịch vụ'], ['03', 'Thông tin & xác nhận']] as const

function formatDate(value: string) {
  if (!value) return 'Chưa chọn'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value + 'T00:00:00'))
}

function inclusiveEndDate(exclusive: string) {
  const date = new Date(exclusive + 'T00:00:00')
  date.setDate(date.getDate() - 1)
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

function quoteText(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount)
}

function endDateExclusive(draft: BookingDraft) {
  if (draft.periodMode === 'dates') return draft.endDate
  if (!draft.startDate || !draft.durationMonths) return ''
  const [year, month, day] = draft.startDate.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + draft.durationMonths, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

type QuoteState = 'idle' | 'loading' | 'ready' | 'error'

type AvailabilityState = 'idle' | 'checking' | 'available' | 'unavailable' | 'error'

function hasValidAvailabilityInput(draft: BookingDraft, approvedDurations: number[]) {
  if (!draft.startDate) return false
  if (draft.periodMode === 'duration') return approvedDurations.includes(draft.durationMonths as 1 | 3 | 6 | 12)
  return Boolean(draft.endDate && draft.endDate > draft.startDate)
}

function AvailabilityBadge({ state, onClick }: { state: AvailabilityState; onClick: () => void }) {
  const interactive = state === 'available' || state === 'unavailable' || state === 'error'
  const label = state === 'checking' ? 'Đang kiểm tra...'
    : state === 'available' ? 'Còn kho phù hợp'
    : state === 'unavailable' ? 'Không còn kho phù hợp'
    : state === 'error' ? 'Không thể kiểm tra'
    : 'Chờ thông tin thời gian'
  const icon = state === 'checking' ? <LoaderCircle className="availability-spinner" size={16} /> : state === 'available' ? <CheckCircle2 size={16} /> : <Info size={16} />
  return <div className={`availability-badge is-${state}`} onClick={interactive ? onClick : undefined} onKeyDown={interactive ? (e) => { if (e.key === 'Enter') onClick() } : undefined} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-live="polite">{icon}<span>{label}</span>{interactive && <ChevronRight size={14} />}</div>
}

function AvailabilityToast({ state, availability, error, onRetry, onClose }: { state: AvailabilityState; availability: AvailabilityResult | null; error: string; onRetry: () => void; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 6000)
    return () => window.clearTimeout(timer)
  }, [onClose])

  const config = state === 'available'
    ? { icon: <CheckCircle2 size={20} />, title: 'Còn kho phù hợp', detail: availability?.message ?? 'Kho phù hợp với yêu cầu hiện tại.' }
    : state === 'unavailable'
    ? { icon: <Info size={20} />, title: 'Không còn kho phù hợp', detail: availability?.message ?? 'Hãy thử đổi thời gian hoặc loại kho.' }
    : { icon: <Info size={20} />, title: 'Không thể kiểm tra lúc này', detail: error || 'Vui lòng thử lại sau.' }

  return <div className={`availability-toast is-${state}`} role="alert">
    <div className="availability-toast-inner">
      {config.icon}
      <div className="availability-toast-text"><strong>{config.title}</strong><span>{config.detail}</span></div>
      {state === 'error' && <button type="button" className="availability-toast-action" onClick={() => { onRetry(); onClose() }}><RotateCcw size={14} /> Thử lại</button>}
      <button type="button" className="availability-toast-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
    </div>
  </div>
}

function AvailabilityStatus({ state, availability, error, onRetry }: { state: AvailabilityState; availability: AvailabilityResult | null; error: string; onRetry: () => void }) {
  if (state === 'checking') return <div className="booking-alert" role="status"><LoaderCircle className="availability-spinner" size={18} /> Đang kiểm tra tình trạng kho mới nhất…</div>
  if (state === 'available') return <div className="booking-alert" role="status"><CheckCircle2 size={18} /><span><strong>Còn kho phù hợp</strong> {availability?.message}</span></div>
  if (state === 'unavailable') return <div className="booking-alert is-error" role="alert"><Info size={18} /><span><strong>Không còn kho phù hợp</strong> {availability?.message}</span></div>
  if (state === 'error') return <div className="booking-alert is-error" role="alert"><Info size={18} /><span>{error || 'Không thể kiểm tra lúc này.'}</span><button type="button" onClick={onRetry}>Thử lại</button></div>
  return <div className="booking-alert" role="status"><Info size={18} /> Chờ thông tin thời gian hợp lệ để kiểm tra kho.</div>
}
interface CheckoutStepProps {
  draft: BookingDraft
  quote: PricingQuote | null
  quoteState: QuoteState
  quoteError: string
  productName: string
  productCode: string
  productSizeId: 'locker' | 'small' | 'medium' | 'large'
  productDimensions: string
  user: ReturnType<typeof useAuth>['user']
  onUpdate: (patch: Partial<BookingDraft>) => void
  onBack: () => void
  onSubmit: (draft: BookingDraft, emailBooking?: boolean) => void
  submitting: boolean
  canSubmit: boolean
}

function CheckoutStep({ draft, quote, quoteState, quoteError, productName, productCode, productSizeId, productDimensions, user, onUpdate, onBack, onSubmit, submitting, canSubmit }: CheckoutStepProps) {
  const [emailBooking, setEmailBooking] = useState(false)
  const supportsEmail = !draft.adjacencyPreference && !draft.note.trim()
  const customer: GuestContact = {
    fullName: user ? user.fullName : draft.customer.fullName,
    phone: user ? user.phone : draft.customer.phone,
    email: user ? user.email : draft.customer.email,
  }
  const paymentChoice = draft.paymentChoice
  const paymentPlan = draft.paymentPlan

  const updateCustomer = (field: keyof GuestContact, value: string) => {
    onUpdate({ customer: { ...customer, [field]: value } })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit({ ...draft, customer, paymentChoice, paymentPlan }, !user && emailBooking && supportsEmail)
  }

  return <div className="checkout-layout">
    <form className="checkout-form" onSubmit={submit}>
      <button type="button" className="booking-back" onClick={onBack}><ArrowLeft size={16} /> Sửa thời gian và dịch vụ</button>
      <p className="eyebrow mt-7">Bước 3</p>
      <h2 className="booking-title">Thông tin khách hàng và cách thanh toán</h2>
      <p className="checkout-intro">Khách chưa đăng nhập có thể gửi yêu cầu liên hệ. Yêu cầu này không phải là giữ chỗ, thanh toán hay hợp đồng.</p>

      <fieldset className="checkout-fieldset">
        <legend>Thông tin liên hệ</legend>
        <div className="checkout-fields">
          <label className="field-label">Họ và tên<input required readOnly={Boolean(user)} minLength={2} autoComplete="name" value={customer.fullName} onChange={(event) => updateCustomer('fullName', event.target.value)} /></label>
          <label className="field-label">Số điện thoại<input required readOnly={Boolean(user)} minLength={8} type="tel" autoComplete="tel" value={customer.phone} onChange={(event) => updateCustomer('phone', event.target.value)} /></label>
          <label className="field-label sm:col-span-2">Email<input required readOnly={Boolean(user)} type="email" autoComplete="email" value={customer.email} onChange={(event) => updateCustomer('email', event.target.value)} /></label>
          <label className="field-label sm:col-span-2">Ghi chú thêm, không bắt buộc<textarea rows={4} maxLength={500} value={draft.note} onChange={(event) => onUpdate({ note: event.target.value })} placeholder="Ví dụ: thời gian thuận tiện để WDP liên hệ" /></label>
        </div>
        {user && <p className="checkout-auth-note"><UserRound size={16} /> Yêu cầu sử dụng thông tin của tài khoản {user.email} đang đăng nhập.</p>}
        {!user && <label className="booking-checkbox"><input type="checkbox" checked={emailBooking && supportsEmail} disabled={submitting || !supportsEmail} onChange={event => setEmailBooking(event.target.checked)} /><span><strong>Xác minh email để nhận yêu cầu đặt kho</strong><small>{supportsEmail ? 'Bạn có thể tạo tài khoản sau khi xác minh email. Chưa giữ kho hoặc thanh toán.' : 'Luồng email chưa hỗ trợ ghi chú hoặc ưu tiên kho liền kề. Yêu cầu liên hệ giữ đầy đủ các thông tin này.'}</small></span></label>}
      </fieldset>

      <fieldset className="checkout-fieldset">
        <legend>Bạn muốn thanh toán như thế nào?</legend>
        <div className="payment-options">
          <button type="button" className="payment-option is-disabled" disabled><span className="payment-option-mark">A</span><span><strong>Thanh toán ngay</strong><small>Thanh toán QR hoặc VNPay tại hóa đơn sau khi yêu cầu đặt kho được xác nhận.</small></span><em>Chờ hóa đơn</em></button>
          <button type="button" className={paymentChoice === 'pay-later' ? 'payment-option is-selected' : 'payment-option'} onClick={() => onUpdate({ paymentChoice: 'pay-later' })} aria-pressed={paymentChoice === 'pay-later'}><span className="payment-option-mark">B</span><span><strong>Thanh toán sau</strong><small>WDP liên hệ để kiểm tra kho, báo giá và hướng dẫn thanh toán.</small></span>{paymentChoice === 'pay-later' && <Check size={18} />}</button>
        </div>
        <label className="field-label mt-5">Kế hoạch thanh toán<select value={paymentPlan} onChange={(event) => onUpdate({ paymentPlan: event.target.value as BookingDraft['paymentPlan'] })}><option value="PAY_MONTHLY">Thanh toán hàng tháng</option><option value="PREPAID">Thanh toán trước</option></select></label>
        <Link className="consult-link" to="/#contact">C. Tư vấn giải pháp riêng tại cơ sở này <ArrowRight size={15} /></Link>
      </fieldset>

      <button className="button-primary mt-7 w-full justify-center" type="submit" disabled={submitting || !canSubmit || paymentChoice !== 'pay-later'}>{submitting ? 'Đang kiểm tra và gửi...' : !canSubmit ? 'Đang xác minh kho…' : user ? 'Gửi yêu cầu đặt kho' : 'Gửi yêu cầu liên hệ'} <ChevronRight size={18} /></button>
    </form>

    <aside className="checkout-quote">
      <div className="quote-product"><StorageIllustration sizeId={productSizeId} /><div><span>{productCode}</span><strong>{productName}</strong><small>{productDimensions} · {draft.quantity} kho</small></div></div>
      <div className="quote-heading"><h3>Báo giá</h3><span>{quoteState === 'loading' ? 'Đang cập nhật…' : 'Theo báo giá từ máy chủ'}</span></div>
      {quoteState === 'loading' && <div className="booking-alert" role="status"><LoaderCircle className="availability-spinner" size={18} /> Đang tính báo giá mới nhất…</div>}
      {quoteState === 'error' && <div className="booking-alert is-error" role="alert"><Info size={18} /><span>{quoteError || 'Không thể tạo báo giá cho lựa chọn này.'}</span></div>}
      {quoteState === 'idle' && <div className="booking-alert" role="status"><Info size={18} /> Chọn thời gian thuê hợp lệ để xem báo giá.</div>}
      {quoteState === 'ready' && quote && <>
        <div className="quote-lines">
          <div><span><strong>Giá niêm yết theo tháng</strong><small>{quote.quantity} kho</small></span><b>{quoteText(quote.monthlyUnitPrice)}</b></div>
          <div><span><strong>Thời hạn thuê</strong><small>{quote.billingMode === 'DAILY' ? `${quote.billableDays} ngày` : `${quote.termMonths} tháng`}</small></span><b>{quote.quantity} kho</b></div>
          <div><span><strong>Tiền thuê trước chiết khấu</strong><small>Giá theo thời hạn và số lượng</small></span><b>{quoteText(quote.baseRentalAmount)}</b></div>
          {quote.discountAmount > 0 && <div><span><strong>Chiết khấu trả trước ({quote.discountPercent}%)</strong><small>Không áp dụng cho tiền đặt cọc</small></span><b>−{quoteText(quote.discountAmount)}</b></div>}
          <div><span><strong>Tiền thuê sau chiết khấu</strong><small>{quote.paymentPlan === 'PREPAID' ? 'Trả trước' : 'Thanh toán hàng tháng'}</small></span><b>{quoteText(quote.rentalAmount)}</b></div>
          <div><span><strong>Tiền đặt cọc</strong><small>Không áp dụng chiết khấu</small></span><b>{quoteText(quote.depositAmount)}</b></div>
          {quote.lineItems.filter(item => item.code.startsWith('service-')).map(item => <div key={item.code}><span><strong>{item.label}</strong><small>{item.basis}</small></span><b>{quoteText(item.amount)}</b></div>)}
        </div>
        <div className="quote-total"><span>Tổng giá trị hợp đồng dự kiến</span><strong>{quoteText(quote.quotedTotalAmount)}</strong></div>
        {quote.amountPayableNow !== null && <div className="quote-total is-payable"><span>Thanh toán ban đầu</span><strong>{quoteText(quote.amountPayableNow)}</strong></div>}
        <div className="booking-alert mt-5"><Info size={18} /><span>{quote.message}</span></div>
      </>}
      <p className="quote-disclosure">Phí và thuế chưa có trong báo giá của máy chủ nên không hiển thị.</p>
    </aside>
  </div>
}

export function BookingWizardPage() {
  const catalog = useCatalog()
  const { getStorageListing, getStorageSize, bookingSizes, approvedDurations, approvedAddons } = catalog
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const requestedStep = Number(params.get('step'))
  const [draft, setDraft] = useState<BookingDraft>(() => {
    const saved = readBookingDraft(catalog)
    const product = params.get('product')
    const date = params.get('date')
    const duration = Number(params.get('duration'))
    return {
      ...saved,
      ...(product && getStorageListing(product) ? { productId: product } : {}),
      ...(date ? { startDate: date } : {}),
      ...(approvedDurations.includes(duration as 1 | 3 | 6 | 12) ? { durationMonths: duration as 1 | 3 | 6 | 12, periodMode: 'duration' } : {}),
    }
  })
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    const savedStep = requestedStep >= 1 && requestedStep <= 3 ? requestedStep as 1 | 2 | 3 : readBookingStep()
    return savedStep === 3 && !readBookingAvailability(draft)?.available ? 2 : savedStep
  })
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null)
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>('idle')
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityRetry, setAvailabilityRetry] = useState(0)
  const availabilityRequest = useRef(0)
  const availabilityController = useRef<AbortController | null>(null)
  const [pricingQuote, setPricingQuote] = useState<PricingQuote | null>(null)
  const [quoteState, setQuoteState] = useState<QuoteState>('idle')
  const [quoteError, setQuoteError] = useState('')
  const quoteRequest = useRef(0)
  const quoteController = useRef<AbortController | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submissionLock = useRef(false)
  const [error, setError] = useState('')
  const [popupOpen, setPopupOpen] = useState(false)
  const prevAvailabilityState = useRef<AvailabilityState>('idle')

  useEffect(() => saveBookingDraft(draft), [draft])
  useEffect(() => saveBookingStep(step), [step])

  useEffect(() => {
    if (prevAvailabilityState.current === 'checking' && (availabilityState === 'available' || availabilityState === 'unavailable' || availabilityState === 'error')) {
      setPopupOpen(true)
    }
    prevAvailabilityState.current = availabilityState
  }, [availabilityState])

  const product = getStorageListing(draft.productId) ?? getStorageListing('sm-b12')!
  const size = getStorageSize(product.sizeId)!
  const selectedCategory = bookingSizes.find((item) => item.id === product.sizeId)!
  const canCheckAvailability = hasValidAvailabilityInput(draft, approvedDurations)
  const pricingEndDate = endDateExclusive(draft)

  const invalidateAvailability = () => {
    availabilityRequest.current += 1
    availabilityController.current?.abort()
    setAvailability(null)
    setAvailabilityState('idle')
    setAvailabilityError('')
    quoteRequest.current += 1
    quoteController.current?.abort()
    setPricingQuote(null)
    setQuoteError('')
    setQuoteState('idle')
    clearBookingAvailability()
  }

  const updateDraft = (patch: Partial<BookingDraft>) => {
    const next = { ...draft, ...patch }
    if (bookingAvailabilityFingerprint(next) !== bookingAvailabilityFingerprint(draft)) invalidateAvailability()
    setDraft(next)
    setError('')
  }

  useEffect(() => {
    if ((step !== 2 && step !== 3) || !canCheckAvailability) {
      availabilityController.current?.abort()
      return
    }

    const requestId = availabilityRequest.current + 1
    availabilityRequest.current = requestId
    const controller = new AbortController()
    availabilityController.current?.abort()
    availabilityController.current = controller
    const requestDraft: BookingDraft = {
      productId: draft.productId,
      startDate: draft.startDate,
      endDate: draft.endDate,
      periodMode: draft.periodMode,
      durationMonths: draft.durationMonths,
      quantity: draft.quantity,
      adjacencyPreference: draft.adjacencyPreference,
      addonIds: draft.addonIds,
      services: draft.services ?? [],
      note: '',
      paymentChoice: 'pay-later',
      paymentPlan: draft.paymentPlan,
      customer: { fullName: '', phone: '', email: '' },
    }

    const timer = window.setTimeout(async () => {
      setAvailabilityState('checking')
      setAvailabilityError('')
      try {
        const result = await bookingApi.availability(requestDraft, controller.signal)
        if (controller.signal.aborted || requestId !== availabilityRequest.current) return
        setAvailability(result)
        saveBookingAvailability(requestDraft, result)
        setAvailabilityState(result.available ? 'available' : 'unavailable')
      } catch (caught) {
        if (controller.signal.aborted || requestId !== availabilityRequest.current) return
        setAvailability(null)
        clearBookingAvailability()
        setAvailabilityState('error')
        setAvailabilityError(caught instanceof Error ? caught.message : 'Không thể kết nối với máy chủ kiểm tra kho.')
      }
    }, 400)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [step, canCheckAvailability, draft.productId, draft.startDate, draft.endDate, draft.periodMode, draft.durationMonths, draft.quantity, draft.paymentPlan, draft.adjacencyPreference, draft.addonIds, draft.services, availabilityRetry])

  useEffect(() => {
    quoteRequest.current += 1
    const requestId = quoteRequest.current
    quoteController.current?.abort()
    if (!canCheckAvailability) {
      return
    }

    const controller = new AbortController()
    quoteController.current = controller
    const endDate = pricingEndDate
    if (!endDate || endDate <= draft.startDate) {
      return () => controller.abort()
    }
    const timer = window.setTimeout(async () => {
      setQuoteState('loading')
      try {
        const quote = await bookingApi.quote({
          storageTypeId: product.id,
          quantity: draft.quantity,
          startDate: draft.startDate,
          endDate,
          paymentPlan: draft.paymentPlan,
          services: draft.services,
        }, controller.signal)
        if (controller.signal.aborted || requestId !== quoteRequest.current) return
        setPricingQuote(quote)
        setQuoteState('ready')
      } catch (caught) {
        if (controller.signal.aborted || requestId !== quoteRequest.current) return
        setPricingQuote(null)
        setQuoteError(caught instanceof Error ? caught.message : 'Không thể tạo báo giá cho lựa chọn này.')
        setQuoteState('error')
      }
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [canCheckAvailability, product.id, draft.startDate, pricingEndDate, draft.quantity, draft.paymentPlan, draft.services, availabilityRetry])

  const selectSize = (sizeId: typeof product.sizeId) => {
    const category = bookingSizes.find((item) => item.id === sizeId)!
    const preferred = category.products.find((item) => item.condition === 'standard') ?? category.products[0]
    updateDraft({ productId: preferred.id })
  }

  const goToStep = (next: 1 | 2 | 3) => {
    if (next === 3 && (availabilityState !== 'available' || !availability?.available || quoteState !== 'ready' || !pricingQuote)) {
      setError(quoteState === 'error' ? 'Báo giá chưa hợp lệ. Vui lòng điều chỉnh thời gian hoặc lựa chọn kho.' : 'Vui lòng đợi báo giá và kết quả kiểm tra kho mới nhất trước khi tiếp tục.')
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setStep(next)
    setError('')
  }

  const retryAvailability = () => {
    if (!canCheckAvailability) return
    setAvailabilityRetry((current) => current + 1)
  }
  const submitCheckout = async (checkoutDraft: BookingDraft, emailBooking = false) => {
    if (submissionLock.current || availabilityState !== 'available' || !availability?.available || quoteState !== 'ready' || !pricingQuote) return
    submissionLock.current = true
    setSubmitting(true)
    setError('')
    try {
      const payload = { ...checkoutDraft, ...checkoutDraft.customer, note: checkoutDraft.note }
      if (!user && emailBooking) {
        const input = { ...checkoutDraft.customer, storageTypeId: checkoutDraft.productId, quantity: checkoutDraft.quantity, startDate: checkoutDraft.startDate, endDate: endDateExclusive(checkoutDraft), paymentPlan: checkoutDraft.paymentPlan, services: checkoutDraft.services ?? [] }
        const fingerprint = JSON.stringify(input)
        const saved = sessionStorage.getItem('wdp-guest-request-retry')
        let retry: { fingerprint: string; key: string } | null = null
        try { retry = saved ? JSON.parse(saved) : null } catch { /* Invalid browser data is replaced. */ }
        const key = retry?.fingerprint === fingerprint ? retry.key : `guest-${crypto.randomUUID()}`
        sessionStorage.setItem('wdp-guest-request-retry', JSON.stringify({ fingerprint, key }))
        const result = await guestBookingApi.create(input, key)
        sessionStorage.removeItem('wdp-guest-request-retry')
        const safeResult = { bookingCode: result.bookingCode, status: result.status, storage: result.storage, quantity: result.quantity, startDate: result.startDate, endDate: result.endDate, quote: result.quote, message: result.message }
        sessionStorage.setItem('wdp-guest-response:' + result.bookingCode, JSON.stringify(safeResult))
        clearBookingDraft()
        navigate('/booking/confirmation/' + result.bookingCode)
        return
      }
      const result: PendingReservation | GuestInquiry = user
        ? await bookingApi.createReservation(payload)
        : await bookingApi.createInquiry(payload)
      if ('accessToken' in result && result.accessToken) {
        sessionStorage.setItem('wdp-inquiry-token:' + result.id, result.accessToken)
      }
      clearBookingDraft()
      navigate('/booking/confirmation/' + result.id, { state: { record: result } })
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setAvailability(null)
        setAvailabilityState('unavailable')
        clearBookingAvailability()
        setStep(2)
        setError(caught.message)
      } else {
        setError(caught instanceof Error ? caught.message : 'Không thể gửi yêu cầu.')
      }
    } finally {
      submissionLock.current = false
      setSubmitting(false)
    }
  }

  return <div className="booking-page">
    <section className="booking-intro">
      <Container className="max-w-6xl">
        <Link to="/storage" className="inline-flex items-center gap-2 text-sm font-semibold text-navy"><ArrowLeft size={17} /> Quay lại danh sách kho</Link>
        <div className="mt-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="eyebrow">Đặt kho nhanh</p><h1>Chọn đúng kho, gửi yêu cầu rõ ràng.</h1></div>
          <p className="max-w-md text-sm leading-6 text-slate">Chọn kho, kiểm tra toàn kỳ và gửi yêu cầu. Kho được phân bổ và hóa đơn được tạo sau khi yêu cầu đặt kho được xác nhận.</p>
        </div>
        <ol className="booking-progress" aria-label="Tiến trình đặt kho">
          {steps.map(([number, label], index) => {
            const value = index + 1
            const active = value === step
            const complete = value < step
            return <li key={number} className={active ? 'is-active' : complete ? 'is-complete' : ''} aria-current={active ? 'step' : undefined}><span>{complete ? <Check size={16} /> : number}</span><strong>{label}</strong></li>
          })}
        </ol>
      </Container>
    </section>

    <section className="booking-main"><Container className="max-w-6xl">
      {error && <div className="booking-alert is-error" role="alert"><Info size={19} /><span>{error}</span></div>}

      {step === 1 && <div className="booking-step-grid">
        <div>
          <p className="eyebrow">Bước 1</p><h2 className="booking-title">Chọn kích thước và loại kho</h2>
          <div className="booking-size-list">{bookingSizes.map((category) => <button key={category.id} type="button" onClick={() => selectSize(category.id)} className={category.id === selectedCategory.id ? 'booking-size-card is-selected' : 'booking-size-card'} aria-pressed={category.id === selectedCategory.id}><StorageIllustration sizeId={category.id} /><span className="booking-size-card-copy"><strong>{category.name}</strong><small>{category.dimensions}</small><small>{category.volume}</small></span><span className="booking-radio" aria-hidden="true" /></button>)}</div>
          <div className="booking-option-block"><h3>Loại kho có sẵn cho {selectedCategory.name.toLowerCase()}</h3><div className="booking-segments" role="group" aria-label="Chọn loại kho">{selectedCategory.products.map((item) => <button key={item.id} type="button" className={item.id === product.id ? 'is-selected' : ''} onClick={() => updateDraft({ productId: item.id })} aria-pressed={item.id === product.id}>{item.condition === 'climate' ? <Snowflake size={18} /> : <Warehouse size={18} />}<span><strong>{item.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'}</strong><small>{item.code}</small></span></button>)}</div></div>
          <div className="booking-option-block"><div className="flex items-center justify-between gap-4"><div><h3>Số lượng kho</h3><p>Tối đa 3 kho trong một yêu cầu.</p></div><div className="quantity-stepper" aria-label="Số lượng kho"><button type="button" onClick={() => updateDraft({ quantity: Math.max(1, draft.quantity - 1), adjacencyPreference: draft.quantity - 1 > 1 && draft.adjacencyPreference })} disabled={draft.quantity === 1} aria-label="Giảm số lượng"><Minus size={17} /></button><output aria-live="polite">{draft.quantity}</output><button type="button" onClick={() => updateDraft({ quantity: Math.min(3, draft.quantity + 1) })} disabled={draft.quantity === 3} aria-label="Tăng số lượng"><Plus size={17} /></button></div></div>{draft.quantity > 1 && <label className="booking-checkbox"><input type="checkbox" checked={draft.adjacencyPreference} onChange={(event) => updateDraft({ adjacencyPreference: event.target.checked })} /><span><strong>Ưu tiên các kho liền kề</strong><small>Đây là mong muốn, không phải cam kết vị trí.</small></span></label>}</div>
        </div>
        <aside className="booking-preview">
          <div className="booking-preview-visual"><StorageIllustration sizeId={product.sizeId} className="is-large" /></div>
          <div className="booking-preview-content">
            <div className="booking-preview-heading"><div><p className="eyebrow">{product.code}</p><h2>{product.name}</h2></div><span className={product.status === 'limited' ? 'status-warning' : 'status-success'}>{product.status === 'limited' ? 'Sắp hết' : 'Đang nhận yêu cầu'}</span></div>
            <dl className="booking-specs"><div><dt>Kích thước</dt><dd>{size.dimensions}</dd></div><div><dt>Diện tích</dt><dd>{size.floorArea}</dd></div><div><dt>Thể tích</dt><dd>{size.volume}</dd></div><div><dt>Sức chứa</dt><dd>{size.boxCount}</dd></div></dl>
            <p className="booking-preview-description">{size.capacity}. Hình minh họa giúp hình dung sức chứa, không phải ảnh kho WDP thực tế.</p>
            <div className="booking-listed-price"><span>Giá niêm yết theo tháng</span><strong>{product.monthlyPrice !== null && product.monthlyPrice > 0 ? quoteText(product.monthlyPrice) : 'Chưa có giá niêm yết'}</strong></div>
            <button type="button" className="button-primary booking-preview-cta w-full justify-center" onClick={() => goToStep(2)}>Chọn thời gian <ArrowRight size={18} /></button>
          </div>
        </aside>
      </div>}

      {step === 2 && <div className="booking-step-grid schedule-grid">
        <div>
          <button type="button" className="booking-back" onClick={() => goToStep(1)}><ArrowLeft size={16} /> Sửa lựa chọn kho</button>
          <p className="eyebrow mt-7">Bước 2</p><h2 className="booking-title">Thời gian và dịch vụ bổ sung</h2>
          <div className="booking-form-panel">
            <label className="field-label">Ngày bắt đầu mong muốn<input type="date" min={new Date().toISOString().slice(0, 10)} name="startDate" value={draft.startDate} onChange={(event) => updateDraft({ startDate: event.target.value })} /></label>
            <div className="period-mode-tabs" role="group" aria-label="Cách chọn thời gian"><button type="button" className={draft.periodMode === 'duration' ? 'is-selected' : ''} onClick={() => updateDraft({ periodMode: 'duration', endDate: '' })}>Theo thời hạn<small>Danh sách đã duyệt</small></button><button type="button" className={draft.periodMode === 'dates' ? 'is-selected' : ''} onClick={() => updateDraft({ periodMode: 'dates', durationMonths: null })}>Theo ngày kết thúc<small>Cần xác nhận báo giá</small></button></div>
            {draft.periodMode === 'duration' ? <fieldset><legend>Thời hạn được phê duyệt</legend><div className="duration-grid">{approvedDurations.map((months) => <button type="button" key={months} className={draft.durationMonths === months ? 'is-selected' : ''} onClick={() => updateDraft({ durationMonths: months })}>{months}<small>tháng</small></button>)}</div></fieldset> : <label className="field-label">Ngày kết thúc dự kiến<input type="date" min={draft.startDate || new Date().toISOString().slice(0, 10)} name="endDate" value={draft.endDate} onChange={(event) => updateDraft({ endDate: event.target.value })} /><small className="field-help">Thời hạn dưới một tháng chưa có chính sách giá, không tự tính đơn giá theo ngày.</small></label>}
            <fieldset className="payment-plan-fieldset"><legend>Cách thanh toán hợp đồng</legend><div className="payment-options">
              <button type="button" className={draft.paymentPlan === 'PAY_MONTHLY' ? 'payment-option is-selected' : 'payment-option'} onClick={() => updateDraft({ paymentPlan: 'PAY_MONTHLY' })} aria-pressed={draft.paymentPlan === 'PAY_MONTHLY'}><span><strong>Thanh toán hàng tháng</strong><small>Không áp dụng chiết khấu trả trước.</small></span>{draft.paymentPlan === 'PAY_MONTHLY' && <Check size={18} />}</button>
              <button type="button" className={draft.paymentPlan === 'PREPAID' ? 'payment-option is-selected' : 'payment-option'} onClick={() => updateDraft({ paymentPlan: 'PREPAID' })} aria-pressed={draft.paymentPlan === 'PREPAID'}><span><strong>Trả trước</strong><small>Chiết khấu theo thời hạn đủ điều kiện, do máy chủ xác định.</small></span>{draft.paymentPlan === 'PREPAID' && <Check size={18} />}</button>
            </div></fieldset>
            <AvailabilityBadge state={availabilityState} onClick={() => setPopupOpen(true)} />
            <section className="addon-section"><div className="addon-heading"><div><h3>Dịch vụ bổ sung được duyệt</h3><p>Giá và khả dụng được kiểm tra qua hệ thống WDP.</p></div></div><AdditionalServicePicker services={approvedAddons} selections={draft.services ?? []} startDate={draft.startDate} endDate={endDateExclusive(draft)} onChange={services => updateDraft({ services })} /></section>
            <label className="field-label">Ghi chú cho WDP, không bắt buộc<textarea rows={3} maxLength={500} value={draft.note} onChange={(event) => updateDraft({ note: event.target.value })} placeholder="Ví dụ: thời gian thuận tiện để liên hệ" /></label>

          </div>
        </div>
        <aside className="booking-summary">
          <div className="booking-summary-product"><StorageIllustration sizeId={product.sizeId} /><div><span>{product.code}</span><strong>{product.name}</strong><small>{size.dimensions} · {draft.quantity} kho</small></div></div>
          <div className="booking-summary-listed-price"><span>Giá niêm yết theo tháng</span><strong>{product.monthlyPrice !== null && product.monthlyPrice > 0 ? quoteText(product.monthlyPrice) : 'Chưa có giá niêm yết'}</strong></div>
          <div className="booking-period"><CalendarDays size={21} /><div><span>Thời gian thuê</span><strong>{draft.startDate ? 'Từ ' + formatDate(draft.startDate) : 'Chưa chọn ngày bắt đầu'}</strong></div></div>
          <dl className="booking-summary-details">
            <div><dt>Ngày bắt đầu</dt><dd>{availability ? formatDate(availability.startDate) : formatDate(draft.startDate)}</dd></div>
            <div><dt>Ngày kết thúc sử dụng</dt><dd>{pricingQuote ? inclusiveEndDate(pricingQuote.endDate) : 'Chờ báo giá hợp lệ'}</dd></div>
            <div><dt>Thời hạn</dt><dd>{pricingQuote ? pricingQuote.billingMode === 'DAILY' ? `${pricingQuote.billableDays} ngày` : `${pricingQuote.termMonths} tháng` : (draft.periodMode === 'duration' ? draft.durationMonths + ' tháng' : 'Chờ ngày kết thúc')}</dd></div>
            <div><dt>Số lượng</dt><dd>{draft.quantity} kho</dd></div>
            <div><dt>Thanh toán</dt><dd>{draft.paymentPlan === 'PREPAID' ? 'Trả trước' : 'Hàng tháng'}</dd></div>
          </dl>
          <div className="booking-pricing">
            <h3>Trạng thái báo giá</h3>
            {quoteState === 'loading' && <div role="status"><LoaderCircle className="availability-spinner" size={17} /> Đang cập nhật báo giá…</div>}
            {quoteState === 'error' && <div className="booking-alert is-error" role="alert">{quoteError}</div>}
            {quoteState === 'idle' && <p>Chọn thời gian thuê hợp lệ để nhận báo giá.</p>}
            {quoteState === 'ready' && pricingQuote && <>
              <div><span><strong>Giá tháng niêm yết</strong><small>{pricingQuote.quantity} kho</small></span><strong>{quoteText(pricingQuote.monthlyUnitPrice)}</strong></div>
              <div><span><strong>Tiền thuê trước chiết khấu</strong><small>{pricingQuote.billingMode === 'DAILY' ? `${pricingQuote.billableDays} ngày` : `${pricingQuote.termMonths} tháng`} × {pricingQuote.quantity} kho</small></span><strong>{quoteText(pricingQuote.baseRentalAmount)}</strong></div>
              {pricingQuote.discountAmount > 0 && <div><span><strong>Chiết khấu trả trước</strong><small>{pricingQuote.discountPercent}%</small></span><strong>−{quoteText(pricingQuote.discountAmount)}</strong></div>}
              <div><span><strong>Tiền thuê sau chiết khấu</strong></span><strong>{quoteText(pricingQuote.rentalAmount)}</strong></div>
              <div><span><strong>Tiền đặt cọc</strong><small>Không giảm theo chiết khấu</small></span><strong>{quoteText(pricingQuote.depositAmount)}</strong></div>
              {pricingQuote.lineItems.filter(item => item.code.startsWith('service-')).map(item => <div key={item.code}><span><strong>{item.label}</strong><small>{item.basis}</small></span><strong>{quoteText(item.amount)}</strong></div>)}
              <div className="booking-pricing-total"><span><strong>Tổng giá trị hợp đồng</strong></span><strong>{quoteText(pricingQuote.quotedTotalAmount)}</strong></div>
              {pricingQuote.amountPayableNow !== null && <div><span><strong>Thanh toán ban đầu</strong></span><strong>{quoteText(pricingQuote.amountPayableNow)}</strong></div>}
              <p>{pricingQuote.message} Phí và thuế chưa có dữ liệu nên không hiển thị.</p>
            </>}
          </div>
          <AvailabilityBadge state={availabilityState} onClick={() => setPopupOpen(true)} />
          <button type="button" className="button-primary mt-5 w-full justify-center" disabled={availabilityState !== 'available' || !availability?.available || quoteState !== 'ready' || !pricingQuote} onClick={() => goToStep(3)}>Tiếp tục <ArrowRight size={18} /></button>
        </aside>
      </div>}

      {step === 3 && <><AvailabilityStatus state={availabilityState} availability={availability} error={availabilityError} onRetry={retryAvailability} />{availabilityState === 'unavailable' && <button className="button-secondary mt-4" onClick={() => goToStep(2)}>Đổi thời gian thuê</button>}<CheckoutStep draft={draft} quote={pricingQuote} quoteState={quoteState} quoteError={quoteError} productName={product.name} productCode={product.code} productSizeId={product.sizeId} productDimensions={size.dimensions} user={user} onUpdate={updateDraft} onBack={() => goToStep(2)} onSubmit={submitCheckout} submitting={submitting} canSubmit={availabilityState === 'available' && quoteState === 'ready' && Boolean(pricingQuote)} /></>}
    </Container></section>
    {popupOpen && availabilityState !== 'idle' && availabilityState !== 'checking' && <AvailabilityToast state={availabilityState} availability={availability} error={availabilityError} onRetry={retryAvailability} onClose={() => setPopupOpen(false)} />}
  </div>
}




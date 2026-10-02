import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Info, LoaderCircle, Minus, Plus, RotateCcw, Snowflake, UserRound, Warehouse } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { StorageIllustration } from '../../components/booking/StorageIllustration'
import { Container } from '../../components/ui/Container'
import { bookingAvailabilityFingerprint, clearBookingAvailability, clearBookingDraft, readBookingAvailability, readBookingDraft, readBookingStep, saveBookingAvailability, saveBookingDraft, saveBookingStep } from '../../data/booking'
import { useCatalog } from '../../catalog/catalog-context'
import { ApiError } from '../../services/api'
import { bookingApi } from '../../services/booking'
import type { AvailabilityResult, BookingDraft, GuestContact, GuestInquiry, PendingReservation } from '../../types/booking'

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

function quoteText(amount: number | null) {
  return amount === null ? 'Cần xác nhận báo giá' : new Intl.NumberFormat('vi-VN').format(amount) + ' đ'
}

function quoteLineItems(quote: AvailabilityResult['quote'] | null) {
  return quote?.lineItems ?? [
    { code: 'storage-rent', label: 'Tiền thuê kho', basis: 'Chưa kiểm tra toàn kỳ', amount: null, status: 'QUOTE_REQUIRED' as const },
    { code: 'deposit', label: 'Tiền đặt cọc', basis: 'Theo báo giá được xác nhận', amount: null, status: 'QUOTE_REQUIRED' as const },
    { code: 'fees', label: 'Phí và thuế áp dụng', basis: 'Chưa có chính sách được duyệt', amount: null, status: 'QUOTE_REQUIRED' as const },
  ]
}

type AvailabilityState = 'idle' | 'checking' | 'available' | 'unavailable' | 'error'

function hasValidAvailabilityInput(draft: BookingDraft, approvedDurations: number[]) {
  if (!draft.startDate) return false
  if (draft.periodMode === 'duration') return approvedDurations.includes(draft.durationMonths as 1 | 3 | 6 | 12)
  return Boolean(draft.endDate && draft.endDate > draft.startDate)
}

function AvailabilityStatus({ state, availability, error, onRetry }: { state: AvailabilityState; availability: AvailabilityResult | null; error: string; onRetry: () => void }) {
  const copy = state === 'checking'
    ? { title: 'Đang kiểm tra...', detail: 'Đang xác minh toàn bộ thời gian thuê và số lượng kho.' }
    : state === 'available'
      ? { title: 'Còn kho phù hợp', detail: availability?.message ?? 'Kho phù hợp với yêu cầu hiện tại.' }
      : state === 'unavailable'
        ? { title: 'Không còn kho phù hợp', detail: availability?.message ?? 'Hãy thử đổi thời gian hoặc loại kho.' }
        : state === 'error'
          ? { title: 'Không thể kiểm tra lúc này', detail: error || 'Vui lòng thử lại sau.' }
          : { title: 'Chờ thông tin thời gian', detail: 'Chọn đủ ngày và thời hạn để kiểm tra tự động.' }
  const icon = state === 'checking' ? <LoaderCircle className="availability-spinner" size={18} /> : state === 'available' ? <CheckCircle2 size={18} /> : <Info size={18} />
  return <div className={`availability-status is-${state}`} aria-live="polite">{icon}<span><strong>{copy.title}</strong><small>{copy.detail}</small></span>{state === 'error' && <button type="button" onClick={onRetry}><RotateCcw size={14} /> Thử lại</button>}</div>
}
interface CheckoutStepProps {
  draft: BookingDraft
  quote: AvailabilityResult['quote'] | null
  productName: string
  productCode: string
  productSizeId: 'locker' | 'small' | 'medium' | 'large'
  productDimensions: string
  user: ReturnType<typeof useAuth>['user']
  onUpdate: (patch: Partial<BookingDraft>) => void
  onBack: () => void
  onSubmit: (draft: BookingDraft) => void
  submitting: boolean
  canSubmit: boolean
}

function CheckoutStep({ draft, quote, productName, productCode, productSizeId, productDimensions, user, onUpdate, onBack, onSubmit, submitting, canSubmit }: CheckoutStepProps) {
  const customer: GuestContact = {
    fullName: user ? user.fullName : draft.customer.fullName,
    phone: user ? user.phone : draft.customer.phone,
    email: user ? user.email : draft.customer.email,
  }
  const paymentChoice = draft.paymentChoice

  const updateCustomer = (field: keyof GuestContact, value: string) => {
    onUpdate({ customer: { ...customer, [field]: value } })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit({ ...draft, customer, paymentChoice })
  }

  const lineItems = quote?.lineItems ?? [
    { code: 'storage-rent', label: 'Tiền thuê kho', basis: 'Chưa kiểm tra toàn kỳ', amount: null, status: 'QUOTE_REQUIRED' as const },
    { code: 'deposit', label: 'Tiền đặt cọc', basis: 'Theo báo giá được xác nhận', amount: null, status: 'QUOTE_REQUIRED' as const },
    { code: 'fees', label: 'Phí và thuế áp dụng', basis: 'Chưa có chính sách được duyệt', amount: null, status: 'QUOTE_REQUIRED' as const },
  ]

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
      </fieldset>

      <fieldset className="checkout-fieldset">
        <legend>Bạn muốn thanh toán như thế nào?</legend>
        <div className="payment-options">
          <button type="button" className="payment-option is-disabled" disabled><span className="payment-option-mark">A</span><span><strong>Thanh toán ngay</strong><small>Sắp ra mắt, chưa có gateway được xác minh hoặc tổng tiền cuối.</small></span><em>Sắp ra mắt</em></button>
          <button type="button" className={paymentChoice === 'pay-later' ? 'payment-option is-selected' : 'payment-option'} onClick={() => onUpdate({ paymentChoice: 'pay-later' })} aria-pressed={paymentChoice === 'pay-later'}><span className="payment-option-mark">B</span><span><strong>Thanh toán sau</strong><small>WDP liên hệ để kiểm tra kho, báo giá và hướng dẫn thanh toán.</small></span>{paymentChoice === 'pay-later' && <Check size={18} />}</button>
        </div>
        <Link className="consult-link" to="/#contact">C. Tư vấn giải pháp riêng tại cơ sở này <ArrowRight size={15} /></Link>
      </fieldset>

      <button className="button-primary mt-7 w-full justify-center" type="submit" disabled={submitting || !canSubmit || paymentChoice !== 'pay-later'}>{submitting ? 'Đang kiểm tra và gửi...' : !canSubmit ? 'Đang xác minh kho…' : user ? 'Gửi yêu cầu đặt kho' : 'Gửi yêu cầu liên hệ'} <ChevronRight size={18} /></button>
    </form>

    <aside className="checkout-quote">
      <div className="quote-product"><StorageIllustration sizeId={productSizeId} /><div><span>{productCode}</span><strong>{productName}</strong><small>{productDimensions} · {draft.quantity} kho</small></div></div>
      <div className="quote-heading"><h3>Báo giá dự kiến</h3><span>Server-authoritative</span></div>
      <div className="quote-lines">{lineItems.map((item) => <div key={item.code}><span><strong>{item.label}</strong><small>{item.basis}</small></span><b>{item.status === 'INCLUDED' ? 'Đã bao gồm' : quoteText(item.amount)}</b></div>)}</div>
      <div className="quote-total"><span>Tổng dự kiến</span><strong>{quoteText(quote?.grandTotal ?? null)}</strong></div>
      <div className="quote-total is-payable"><span>Thanh toán ngay</span><strong>Chưa hỗ trợ</strong></div>
      <div className="booking-alert mt-5"><Info size={18} /><span>{quote?.message ?? 'Hãy kiểm tra khả dụng để nhận snapshot báo giá. Các khoản chưa được WDP duyệt sẽ không bị tính ngầm.'}</span></div>
      <p className="quote-disclosure">Không có bảo hiểm hoặc vận chuyển trong prototype. Dịch vụ bổ sung chỉ xuất hiện khi có dữ liệu và giá được WDP duyệt.</p>
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => saveBookingDraft(draft), [draft])
  useEffect(() => saveBookingStep(step), [step])

  const product = getStorageListing(draft.productId) ?? catalog.products[0]
  const size = getStorageSize(product.sizeId)!
  const selectedCategory = bookingSizes.find((item) => item.id === product.sizeId)!
    const canCheckAvailability = hasValidAvailabilityInput(draft, approvedDurations)

  const invalidateAvailability = () => {
    availabilityRequest.current += 1
    availabilityController.current?.abort()
    setAvailability(null)
    setAvailabilityState('idle')
    setAvailabilityError('')
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
      note: '',
      paymentChoice: 'pay-later',
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
  }, [step, canCheckAvailability, draft.productId, draft.startDate, draft.endDate, draft.periodMode, draft.durationMonths, draft.quantity, draft.adjacencyPreference, draft.addonIds, availabilityRetry])

  const selectSize = (sizeId: typeof product.sizeId) => {
    const category = bookingSizes.find((item) => item.id === sizeId)!
    const preferred = category.products.find((item) => item.condition === 'standard') ?? category.products[0]
    updateDraft({ productId: preferred.id })
  }

  const goToStep = (next: 1 | 2 | 3) => {
    if (next === 3 && (availabilityState !== 'available' || !availability?.available)) {
      setError('Vui lòng đợi kết quả kiểm tra kho mới nhất trước khi tiếp tục.')
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
  const submitCheckout = async (checkoutDraft: BookingDraft) => {
    if (submitting || availabilityState !== 'available' || !availability?.available) return
    setSubmitting(true)
    setError('')
    try {
      const payload = { ...checkoutDraft, ...checkoutDraft.customer, note: checkoutDraft.note }
      const result: PendingReservation | GuestInquiry = user
        ? await bookingApi.createReservation(payload)
        : await bookingApi.createInquiry(payload)
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
      setSubmitting(false)
    }
  }

  return <div className="booking-page">
    <section className="booking-intro">
      <Container className="max-w-6xl">
        <Link to="/storage" className="inline-flex items-center gap-2 text-sm font-semibold text-navy"><ArrowLeft size={17} /> Quay lại danh sách kho</Link>
        <div className="mt-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="eyebrow">Đặt kho nhanh</p><h1>Chọn đúng kho, gửi yêu cầu rõ ràng.</h1></div>
          <p className="max-w-md text-sm leading-6 text-slate">Bản prototype hỗ trợ yêu cầu liên hệ và reservation PENDING. Không có thanh toán ngay, hợp đồng hay cam kết giữ kho.</p>
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
            <AvailabilityStatus state={availabilityState} availability={availability} error={availabilityError} onRetry={retryAvailability} />
            <section className="addon-section"><div className="addon-heading"><div><h3>Dịch vụ bổ sung được duyệt</h3><p>Chỉ các dịch vụ có giá và charging basis chính thức mới xuất hiện.</p></div></div>{approvedAddons.length === 0 ? <div className="addon-empty"><Info size={19} /><span><strong>Chưa có dịch vụ bổ sung được WDP duyệt</strong><small>Không có bảo hiểm, vận chuyển hoặc add-on giả lập trong prototype.</small></span></div> : <div>{approvedAddons.map(() => null)}</div>}</section>
            <label className="field-label">Ghi chú cho WDP, không bắt buộc<textarea rows={3} maxLength={500} value={draft.note} onChange={(event) => updateDraft({ note: event.target.value })} placeholder="Ví dụ: thời gian thuận tiện để liên hệ" /></label>

          </div>
        </div>
        <aside className="booking-summary">
          <div className="booking-summary-product"><StorageIllustration sizeId={product.sizeId} /><div><span>{product.code}</span><strong>{product.name}</strong><small>{size.dimensions} · {draft.quantity} kho</small></div></div>
          <div className="booking-period"><CalendarDays size={21} /><div><span>Thời gian thuê</span><strong>{draft.startDate ? 'Từ ' + formatDate(draft.startDate) : 'Chưa chọn ngày bắt đầu'}</strong></div></div>
          <dl className="booking-summary-details">
            <div><dt>Ngày bắt đầu</dt><dd>{availability ? formatDate(availability.startDate) : formatDate(draft.startDate)}</dd></div>
            <div><dt>Ngày kết thúc sử dụng</dt><dd>{availability ? inclusiveEndDate(availability.endDateExclusive) : 'Cần kiểm tra toàn kỳ'}</dd></div>
            <div><dt>Thời hạn</dt><dd>{availability?.quote.lineItems[0]?.basis ?? (draft.periodMode === 'duration' ? draft.durationMonths + ' tháng' : 'Chờ ngày kết thúc')}</dd></div>
            <div><dt>Số lượng</dt><dd>{draft.quantity} kho</dd></div>
          </dl>
          <div className="booking-pricing">
            <h3>Trạng thái báo giá</h3>
            {quoteLineItems(availability?.quote ?? null).map((item) => <div key={item.code}><span><strong>{item.label}</strong><small>{item.basis}</small></span><strong>{item.status === 'INCLUDED' ? 'Đã bao gồm' : quoteText(item.amount)}</strong></div>)}
            <p>{availability?.quote.message ?? 'Kiểm tra toàn kỳ để tạo snapshot báo giá. Khoản chưa có dữ liệu sẽ không được tính ngầm.'}</p>
          </div>
          <AvailabilityStatus state={availabilityState} availability={availability} error={availabilityError} onRetry={retryAvailability} />
          <button type="button" className="button-primary mt-5 w-full justify-center" disabled={availabilityState !== 'available' || !availability?.available} onClick={() => goToStep(3)}>Tiếp tục <ArrowRight size={18} /></button>
        </aside>
      </div>}

      {step === 3 && <><AvailabilityStatus state={availabilityState} availability={availability} error={availabilityError} onRetry={retryAvailability} />{availabilityState === 'unavailable' && <button className="button-secondary mt-4" onClick={() => goToStep(2)}>Đổi thời gian thuê</button>}<CheckoutStep draft={draft} quote={availability?.quote ?? null} productName={product.name} productCode={product.code} productSizeId={product.sizeId} productDimensions={size.dimensions} user={user} onUpdate={updateDraft} onBack={() => goToStep(2)} onSubmit={submitCheckout} submitting={submitting} canSubmit={availabilityState === 'available'} /></>}
    </Container></section>
  </div>
}




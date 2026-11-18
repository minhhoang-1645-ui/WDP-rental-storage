import { lastCreatedKey } from '../../utils/record-identity';
import { safeSessionStorage } from '../../services/browser-storage'
import { vietnamCalendarDate } from '../../utils/business-date'
import { AvailabilityNotice, BookingSummary, type AvailabilityState, type QuoteState } from '../../components/booking/BookingSummary'
import { quotePaymentSummary } from '../../utils/quote-payment-summary'
import { serviceDisplayName } from '../../utils/service-labels'
import '../../styles/booking-workflow.css'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Info, Minus, Plus, Warehouse } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { StorageImage } from '../../components/public/StorageImage'
import { storageMonthlyPrice, storageSpecifications, storageGroupSummary } from '../../utils/storage-selection'
import { AdditionalServicePicker } from '../../components/booking/AdditionalServicePicker'
import { Container } from '../../components/ui/Container'
import { bookingDate, bookingAvailabilityFingerprint, clearBookingAvailability, clearBookingDraft, readBookingAvailability, readBookingDraft, readBookingStep, saveBookingAvailability, saveBookingDraft, saveBookingStep } from '../../data/booking'
import { useCatalog } from '../../catalog/catalog-context'
import { ApiError } from '../../services/api'
import { bookingApi } from '../../services/booking'
import { guestBookingApi } from '../../services/guest-booking'
import { serviceSelectionIssue } from '../../utils/service-period'
import type { AvailabilityResult, BookingDraft, GuestContact, GuestInquiry, PendingReservation, PricingQuote } from '../../types/booking'

const steps = ['Chọn kho', 'Thời gian & dịch vụ', 'Xác nhận']

function quoteText(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount)
}

function endDateExclusive(draft: BookingDraft) {
  if (draft.periodMode === 'dates') return bookingDate(draft.endDate)
  if (!bookingDate(draft.startDate) || typeof draft.durationMonths !== 'number' || !Number.isInteger(draft.durationMonths) || draft.durationMonths <= 0) return ''
  const [year, month, day] = draft.startDate.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + draft.durationMonths, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return bookingDate(target.toISOString().slice(0, 10))
}

function hasValidAvailabilityInput(draft: BookingDraft, approvedDurations: number[]) {
  if (!bookingDate(draft.startDate) || draft.startDate < vietnamCalendarDate() || !endDateExclusive(draft)) return false
  if (draft.periodMode === 'duration') return approvedDurations.includes(draft.durationMonths as 1 | 3 | 6 | 12)
  return Boolean(bookingDate(draft.endDate) && draft.endDate > draft.startDate)
}

interface CheckoutStepProps {
  draft: BookingDraft
  summary: ReactNode
  user: ReturnType<typeof useAuth>['user']
  onUpdate: (patch: Partial<BookingDraft>) => void
  onBack: () => void
  profileReturnPath: string
  onSubmit: (draft: BookingDraft, emailBooking?: boolean) => void
  submitting: boolean
  canSubmit: boolean
  preferContact: boolean
}

function CheckoutStep({ draft, summary, user, onUpdate, onBack, profileReturnPath, onSubmit, submitting, canSubmit, preferContact }: CheckoutStepProps) {
  const [emailBooking, setEmailBooking] = useState(!preferContact)
  const supportsEmail = !draft.adjacencyPreference && !draft.note.trim()
  const customer: GuestContact = {
    fullName: user ? user.fullName : draft.customer.fullName,
    phone: user ? user.phone : draft.customer.phone,
    email: user ? user.email : draft.customer.email,
  }
  const needsProfile = Boolean(user && (user.fullName.trim().length < 2 || user.phone.replace(/\D/g, '').length < 8))
  const updateCustomer = (field: keyof GuestContact, value: string) => {
    onUpdate({ customer: { ...customer, [field]: value } })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (needsProfile) return
    onSubmit({ ...draft, customer, paymentChoice: 'pay-later' }, !user && emailBooking && supportsEmail)
  }

  return <div className="checkout-layout">
    <form className="checkout-form" onSubmit={submit}>
      <button type="button" className="booking-back" onClick={onBack}><ArrowLeft size={16} /> Sửa thời gian thuê</button>
      <h2 id="booking-step-title" tabIndex={-1} className="booking-title">Xác nhận đặt kho</h2>

      <fieldset className="checkout-fieldset">
        <legend>Thông tin liên hệ</legend>
        <div className="checkout-fields">
          <label className="field-label">Họ và tên<input required readOnly={Boolean(user)} minLength={2} autoComplete="name" value={customer.fullName} onChange={(event) => updateCustomer('fullName', event.target.value)} /></label>
          <label className="field-label">Số điện thoại<input required readOnly={Boolean(user)} minLength={8} type="tel" autoComplete="tel" value={customer.phone} onChange={(event) => updateCustomer('phone', event.target.value)} /></label>
          <label className="field-label sm:col-span-2">Email<input required readOnly={Boolean(user)} type="email" autoComplete="email" value={customer.email} onChange={(event) => updateCustomer('email', event.target.value)} /></label>
        </div>
        {user && <div className={`booking-alert mt-5${needsProfile ? ' is-error' : ''}`} role={needsProfile ? 'alert' : 'note'}>
          <span>
            {needsProfile && 'Bổ sung họ tên và số điện thoại trước khi gửi yêu cầu.'}
            <Link className="font-semibold underline" to={'/customer/profile?returnTo=' + encodeURIComponent(profileReturnPath)}>Cập nhật thông tin liên hệ</Link>
          </span>
        </div>}
        {!user && <label className="booking-checkbox"><input type="checkbox" checked={emailBooking && supportsEmail} disabled={submitting || !supportsEmail} onChange={event => setEmailBooking(event.target.checked)} /><span><strong>Xác minh qua email</strong><small>{supportsEmail ? 'Mở liên kết trong email để tiếp tục.' : 'Nhân viên sẽ liên hệ về yêu cầu có ghi chú hoặc ưu tiên kho liền kề.'}</small></span></label>}
      </fieldset>

      <button className="button-primary booking-checkout-cta" type="submit" disabled={submitting || !canSubmit || needsProfile}>
        {submitting ? 'Đang gửi…' : user ? 'Xác nhận đặt kho' : emailBooking && supportsEmail ? 'Gửi yêu cầu đặt kho' : 'Gửi yêu cầu liên hệ'} <ArrowRight size={18} aria-hidden="true" />
      </button>
    </form>
    {summary}
  </div>
}

export function BookingWizardPage() {
  const catalog = useCatalog()
  const { getStorageListing, getStorageSize, bookingSizes, approvedDurations, approvedAddons } = catalog
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const quick = params.get('mode') === 'quick'
  const requestedStep = Number(params.get('step'))
  const [draft, setDraft] = useState<BookingDraft>(() => {
    const saved = readBookingDraft(catalog)
    const product = params.get('product')
    const date = bookingDate(params.get('date'))
    const duration = Number(params.get('duration'))
    return {
      ...saved,
      ...(product && getStorageListing(product) ? { productId: product } : {}),
      ...(date ? { startDate: date } : {}),
      ...(approvedDurations.includes(duration as 1 | 3 | 6 | 12) ? { durationMonths: duration as 1 | 3 | 6 | 12, periodMode: 'duration' } : {}),
    }
  })
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    const savedStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 3 ? requestedStep as 1 | 2 | 3 : readBookingStep()
    return savedStep === 3 && !readBookingAvailability(draft)?.available ? 2 : savedStep
  })
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    document.getElementById('booking-step-title')?.focus({ preventScroll: true })
  }, [step])
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null)
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>('idle')
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityChanged, setAvailabilityChanged] = useState(false)
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
  useEffect(() => saveBookingDraft(draft), [draft])
  useEffect(() => saveBookingStep(step), [step])

  const product = getStorageListing(draft.productId) ?? catalog.products[0]
  const size = storageSpecifications(product, getStorageSize(product.sizeId)!)
  const selectedCategory = bookingSizes.find((item) => item.id === product.sizeId)!
  const canCheckAvailability = product.id === draft.productId && hasValidAvailabilityInput(draft, approvedDurations) && !(draft.services ?? []).some(selection => serviceSelectionIssue(approvedAddons.find(service => service.id === selection.serviceId), selection, draft.startDate, endDateExclusive(draft)))
  const pricingEndDate = endDateExclusive(draft)

  const invalidateAvailability = () => {
    availabilityRequest.current += 1
    availabilityController.current?.abort()
    setAvailability(null)
    setAvailabilityState('idle')
    setAvailabilityError('')
    setAvailabilityChanged(false)
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
        setAvailabilityError(caught instanceof ApiError && caught.status === 400 ? caught.message : '')
      }
    }, 400)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [step, canCheckAvailability, draft.productId, draft.startDate, draft.endDate, draft.periodMode, draft.durationMonths, draft.quantity, draft.paymentPlan, draft.adjacencyPreference, draft.addonIds, draft.services, availabilityRetry])

  const showQuote = step !== 1 && canCheckAvailability
  useEffect(() => {
    quoteRequest.current += 1
    const requestId = quoteRequest.current
    quoteController.current?.abort()
    if (!showQuote) return

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
  }, [showQuote, product.id, draft.startDate, pricingEndDate, draft.quantity, draft.paymentPlan, draft.services, availabilityRetry])

  const selectSize = (sizeId: typeof product.sizeId) => {
    const category = bookingSizes.find((item) => item.id === sizeId)!
    const preferred = category.products.find((item) => item.condition === 'standard') ?? category.products[0]
    updateDraft({ productId: preferred.id })
  }

  const readyQuote = canCheckAvailability && availabilityState === 'available' && availability?.available && quoteState === 'ready' ? pricingQuote : null
  const goToStep = (next: 1 | 2 | 3) => {
    if (next === 3 && !readyQuote) {
      setError(quoteState === 'error' ? 'Báo giá chưa hợp lệ. Vui lòng điều chỉnh thời gian hoặc lựa chọn kho.' : 'Vui lòng đợi báo giá và kết quả kiểm tra kho mới nhất trước khi tiếp tục.')
      return
    }
    if (next !== 1 && next !== step && canCheckAvailability) setAvailabilityState('checking')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setStep(next)
    setError('')
  }

  const retryAvailability = () => {
    if (!canCheckAvailability) return
    invalidateAvailability()
    setAvailabilityState('checking')
    setAvailabilityRetry((current) => current + 1)
  }
  const submitCheckout = async (checkoutDraft: BookingDraft, emailBooking = false) => {
    if (submissionLock.current || !readyQuote) return
    submissionLock.current = true
    setSubmitting(true)
    setError('')
    try {
      const payload = { ...checkoutDraft, ...checkoutDraft.customer, note: checkoutDraft.note }
      if (!user && emailBooking) {
        const input = { ...checkoutDraft.customer, storageTypeId: checkoutDraft.productId, quantity: checkoutDraft.quantity, startDate: checkoutDraft.startDate, endDate: endDateExclusive(checkoutDraft), paymentPlan: checkoutDraft.paymentPlan, services: checkoutDraft.services ?? [] }
        const fingerprint = JSON.stringify(input)
        const saved = safeSessionStorage.getItem('wdp-guest-request-retry')
        let retry: { fingerprint: string; key: string } | null = null
        try { retry = saved ? JSON.parse(saved) : null } catch { /* Invalid browser data is replaced. */ }
        const key = retry?.fingerprint === fingerprint ? retry.key : `guest-${crypto.randomUUID()}`
        safeSessionStorage.setItem('wdp-guest-request-retry', JSON.stringify({ fingerprint, key }))
        const result = await guestBookingApi.create(input, key)
        safeSessionStorage.removeItem('wdp-guest-request-retry')
        const safeResult = { bookingCode: result.bookingCode, status: result.status, storage: result.storage, quantity: result.quantity, startDate: result.startDate, endDate: result.endDate, quote: result.quote, message: result.message }
        safeSessionStorage.setItem('wdp-guest-response:' + result.bookingCode, JSON.stringify(safeResult))
        // Keep selections available if price/availability changes before claim.
        navigate('/booking/confirmation/' + result.bookingCode, { state: { guestBooking: safeResult } })
        return
      }
      const result: PendingReservation | GuestInquiry = user
        ? await bookingApi.createReservation(payload)
        : await bookingApi.createInquiry(payload)
      if ('accessToken' in result && result.accessToken) {
        safeSessionStorage.setItem('wdp-inquiry-token:' + result.id, result.accessToken)
      }
      clearBookingDraft()
      if (user) {
        safeSessionStorage.setItem(lastCreatedKey(user.id), result.id)
        navigate('/customer/reservations/' + encodeURIComponent(result.id), { state: { createdReservationId: result.id } })
      } else navigate('/booking/confirmation/' + encodeURIComponent(result.id), { state: { record: result } })
    } catch (caught) {
      const rejectedAvailability = caught instanceof ApiError && caught.status === 409
        ? (caught.payload as { availability?: AvailabilityResult } | null)?.availability : undefined
      if (rejectedAvailability?.available === false) {
        setAvailability(rejectedAvailability)
        setAvailabilityState('unavailable')
        setAvailabilityChanged(true)
        clearBookingAvailability()
        window.requestAnimationFrame(() => document.getElementById('booking-order-summary')?.scrollIntoView({ block: 'nearest' }))
      } else {
        setError(caught instanceof Error ? caught.message : 'Không thể gửi yêu cầu.')
      }
    } finally {
      submissionLock.current = false
      setSubmitting(false)
    }
  }

  const shownAvailability = availabilityState === 'idle' && canCheckAvailability && step !== 1 ? 'checking' : availabilityState
  const selectedServices = (draft.services ?? []).map(selection => {
    const service = approvedAddons.find(item => item.id === selection.serviceId)
    return { id: selection.serviceId, name: service ? serviceDisplayName(service.code, service.name) : 'Dịch vụ đã chọn', quantity: selection.quantity }
  })
  const firstPayment = readyQuote ? quotePaymentSummary(readyQuote).first : null
  const continueButton = (className = '') => <button type="button" className={`button-primary ${className}`} disabled={!readyQuote} onClick={() => goToStep(3)}>
    Tiếp tục <ArrowRight size={18} aria-hidden="true" />
  </button>
  const notice = <AvailabilityNotice
    state={shownAvailability} result={availability} error={availabilityError} quantity={draft.quantity} changed={availabilityChanged}
    onRetry={retryAvailability} onStorage={() => goToStep(1)}
    onDates={() => {
      if (step !== 2) goToStep(2)
      window.requestAnimationFrame(() => document.getElementById('booking-start-date')?.focus())
    }}
    onQuantity={quantity => {
      updateDraft({ quantity, adjacencyPreference: quantity > 1 && draft.adjacencyPreference })
      if (step !== 2) goToStep(2)
    }}
  />
  const summary = <BookingSummary product={product} draft={draft} endDate={pricingEndDate} services={selectedServices} quote={readyQuote} quoteState={quoteState} quoteError={quoteError} availabilityState={shownAvailability} onRetry={retryAvailability}
    onRemoveService={step === 2 ? id => updateDraft({ services: draft.services?.filter(service => service.serviceId !== id) }) : undefined}
  >
    {notice}
    {step === 2 && continueButton('booking-continue-desktop')}
  </BookingSummary>

  return <div className="booking-page booking-workflow">
    <section className="public-page-intro booking-intro">
      <Container>
        <Link to="/storage" className="booking-back"><ArrowLeft size={17} /> Danh sách kho</Link>
        <h1>{quick ? 'Đặt kho nhanh' : 'Đặt kho'}</h1>
        <ol className="booking-progress" aria-label="Tiến trình đặt kho">
          {steps.map((label, index) => {
            const value = index + 1
            const active = value === step
            const complete = value < step
            return <li key={label} className={active ? 'is-active' : complete ? 'is-complete' : ''} aria-current={active ? 'step' : undefined}><span aria-hidden="true">{complete ? <Check size={16} /> : value}</span><strong>{label}</strong></li>
          })}
        </ol>
      </Container>
    </section>

    <section className="public-page-content booking-main"><Container>
      {error && <div className="booking-alert is-error" role="alert"><Info size={19} /><span>{error}</span></div>}

      {step === 1 && <div className="booking-step-grid">
        <div>
          <h2 id="booking-step-title" tabIndex={-1} className="booking-title">Kích thước kho</h2>
          <div className="booking-size-list">{bookingSizes.map((category) => <button key={category.id} type="button" onClick={() => selectSize(category.id)} className="booking-size-card" aria-pressed={category.id === selectedCategory.id}>
            <span className="booking-category-icon"><Warehouse size={23} aria-hidden="true" /></span>
            <span className="booking-size-card-copy"><strong>{category.name}</strong><small>{storageGroupSummary(category.products, category)}</small></span>
            <span className="booking-radio" aria-hidden="true" />
          </button>)}</div>
          <div className="booking-option-block">
            <h3>Loại kho</h3>
            <div className="booking-segments booking-product-options" role="group" aria-label="Chọn loại kho">
              {selectedCategory.products.map((item) => <button key={item.id} type="button" onClick={() => updateDraft({ productId: item.id })} aria-pressed={item.id === product.id}>
                <StorageImage src={item.image} alt="" loading="lazy" />
                <span>
                  <strong>{item.name}</strong>
                  <small>{storageSpecifications(item, getStorageSize(item.sizeId)!).dimensions}</small>
                  <small className="booking-choice-price">{storageMonthlyPrice(item.monthlyPrice)}{item.monthlyPrice !== null ? ' / kho / tháng' : ''}</small>
                  <small className="booking-choice-action">{item.id === product.id ? 'Đã chọn' : 'Chọn kho'}</small>
                </span>
              </button>)}
            </div>
          </div>
          <div className="booking-option-block"><div className="flex items-center justify-between gap-4"><div><h3>Số lượng kho</h3><p>Tối đa 3 kho</p></div><div className="quantity-stepper" aria-label="Số lượng kho"><button type="button" onClick={() => updateDraft({ quantity: Math.max(1, draft.quantity - 1), adjacencyPreference: draft.quantity - 1 > 1 && draft.adjacencyPreference })} disabled={draft.quantity === 1} aria-label="Giảm số lượng"><Minus size={17} /></button><output aria-live="polite">{draft.quantity}</output><button type="button" onClick={() => updateDraft({ quantity: Math.min(3, draft.quantity + 1) })} disabled={draft.quantity === 3} aria-label="Tăng số lượng"><Plus size={17} /></button></div></div>{draft.quantity > 1 && <label className="booking-checkbox"><input type="checkbox" checked={draft.adjacencyPreference} onChange={(event) => updateDraft({ adjacencyPreference: event.target.checked })} /><span><strong>Ưu tiên các kho liền kề</strong><small>Vị trí sẽ được xác nhận khi phân kho.</small></span></label>}</div>
        </div>
        <aside className="booking-preview">
          <div className="booking-preview-visual"><StorageImage src={product.image} alt="" /></div>
          <div className="booking-preview-content">
            <div className="booking-preview-heading"><h2>{draft.quantity} kho · {product.name}</h2></div>
            <div className="booking-listed-price"><span>Giá thuê / kho / tháng</span><strong>{storageMonthlyPrice(product.monthlyPrice)}</strong></div>
            <details className="booking-disclosure">
              <summary>Thông tin loại kho <ChevronDown size={16} aria-hidden="true" /></summary>
              <dl className="booking-specs"><div><dt>Kích thước</dt><dd>{size.dimensions}</dd></div><div><dt>Diện tích</dt><dd>{size.floorArea}</dd></div><div><dt>Thể tích</dt><dd>{size.volume}</dd></div><div><dt>Điều kiện</dt><dd>{product.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'}</dd></div></dl>
            </details>
            <button type="button" className="button-primary booking-preview-cta w-full justify-center" onClick={() => goToStep(2)}>Chọn thời gian <ArrowRight size={18} /></button>
          </div>
        </aside>
      </div>}

      {step === 2 && <div className="booking-schedule"><div className="booking-step-grid schedule-grid">
        <div>
          <button type="button" className="booking-back" onClick={() => goToStep(1)}><ArrowLeft size={16} /> Sửa lựa chọn kho</button>
          <h2 id="booking-step-title" tabIndex={-1} className="booking-title">Thời gian & dịch vụ</h2>
          <div className="booking-form-panel">
            <label className="field-label">Ngày bắt đầu<input type="date" min={vietnamCalendarDate()} id="booking-start-date" name="startDate" value={draft.startDate} onChange={(event) => updateDraft({ startDate: event.target.value })} /></label>
            <div className="period-mode-tabs" role="group" aria-label="Cách chọn thời gian">
              <button type="button" aria-pressed={draft.periodMode === 'duration'} onClick={() => updateDraft({ periodMode: 'duration', endDate: '' })}>Theo số tháng</button>
              <button type="button" aria-pressed={draft.periodMode === 'dates'} onClick={() => updateDraft({ periodMode: 'dates', durationMonths: null })}>Theo ngày kết thúc</button>
            </div>
            {draft.periodMode === 'duration' ? <fieldset>
              <legend>Số tháng thuê</legend>
              <div className="duration-grid">{approvedDurations.map((months) => <button type="button" key={months} aria-pressed={draft.durationMonths === months} onClick={() => updateDraft({ durationMonths: months })}>{months}<small>tháng</small></button>)}</div>
            </fieldset> : <label className="field-label">
              Ngày kết thúc
              <input type="date" min={draft.startDate || vietnamCalendarDate()} name="endDate" value={draft.endDate} onChange={(event) => updateDraft({ endDate: event.target.value })} />
              <small className="field-help">Thuê ít nhất {product.allowDailyRental ? `${product.minRentalDays ?? 1} ngày` : '1 tháng'}. Ngày kết thúc nằm ngoài kỳ thuê.</small>
            </label>}
            <fieldset className="payment-plan-fieldset"><legend>Cách thanh toán</legend><div className="payment-options">
              <button type="button" className="payment-option" onClick={() => updateDraft({ paymentPlan: 'PAY_MONTHLY' })} aria-pressed={draft.paymentPlan === 'PAY_MONTHLY'}><span className="payment-option-copy"><strong>Trả hàng tháng</strong><small>Thanh toán theo từng kỳ</small></span>{draft.paymentPlan === 'PAY_MONTHLY' && <Check size={18} />}</button>
              <button type="button" className="payment-option" onClick={() => updateDraft({ paymentPlan: 'PREPAID' })} aria-pressed={draft.paymentPlan === 'PREPAID'}><span className="payment-option-copy"><strong>Trả trước cả kỳ</strong>{Boolean(readyQuote?.discountPercent) && <small>Giảm {readyQuote?.discountPercent}% tiền thuê</small>}</span>{draft.paymentPlan === 'PREPAID' && <Check size={18} />}</button>
            </div></fieldset>
            <section className="addon-section"><div className="addon-heading"><h3>Dịch vụ bổ sung</h3></div><AdditionalServicePicker services={approvedAddons} selections={draft.services ?? []} startDate={draft.startDate} endDate={endDateExclusive(draft)} onChange={services => updateDraft({ services })} /></section>
            <details className="booking-disclosure" open={draft.note ? true : undefined}>
              <summary>Thêm ghi chú <ChevronDown size={16} aria-hidden="true" /></summary>
              <textarea aria-label="Ghi chú (không bắt buộc)" rows={3} maxLength={500} value={draft.note} onChange={(event) => updateDraft({ note: event.target.value })} />
            </details>
          </div>
        </div>
        {summary}
      </div>
      <div className="booking-mobile-bar">
        <a href="#booking-order-summary" aria-label="Xem tóm tắt giá">
          <span>Thanh toán lần đầu</span><strong>{firstPayment === null ? 'Chờ báo giá' : quoteText(firstPayment)}</strong>
        </a>
        {continueButton()}
      </div></div>}

      {step === 3 && <CheckoutStep
        draft={draft} summary={summary} user={user} onUpdate={updateDraft} onBack={() => goToStep(2)}
        profileReturnPath={'/booking?product=' + encodeURIComponent(draft.productId) + '&step=3' + (quick ? '&mode=quick' : '')}
        onSubmit={submitCheckout} submitting={submitting} canSubmit={Boolean(readyQuote)} preferContact={params.get('contact') === '1'}
      />}
    </Container></section>
  </div>
}

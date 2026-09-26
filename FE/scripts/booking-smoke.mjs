import { writeFile } from 'node:fs/promises'

const devtools = 'http://127.0.0.1:9333'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForDevTools() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`${devtools}/json/list`).then((response) => response.json())
      const target = targets.find((item) => item.type === 'page')
      if (target) return target
    } catch {}
    await sleep(250)
  }
  throw new Error('Edge DevTools did not become ready')
}

const target = await waitForDevTools()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 1
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data))
  if (!message.id) return
  const handler = pending.get(message.id)
  if (!handler) return
  pending.delete(message.id)
  if (message.error) handler.reject(new Error(message.error.message))
  else handler.resolve(message.result)
})

function send(method, params = {}) {
  const id = nextId++
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function waitFor(expression, label, timeout = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await sleep(150)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function clickText(text) {
  const clicked = await evaluate(`(() => {
    const element = [...document.querySelectorAll('button,a')].find((item) => item.textContent?.includes(${JSON.stringify(text)}))
    if (!element) return false
    element.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Cannot find clickable text: ${text}`)
}

async function setField(selector, value) {
  const changed = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return false
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)})
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!changed) throw new Error(`Cannot find field: ${selector}`)
}

async function capture(path) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path, Buffer.from(result.data, 'base64'))
}

await send('Page.enable')
await send('Runtime.enable')
await waitFor("document.querySelectorAll('.booking-size-card').length === 4", 'four storage size cards')

const initial = await evaluate(`({
  code: document.querySelector('.booking-preview .eyebrow')?.textContent,
  quantity: document.querySelector('.quantity-stepper output')?.textContent,
  cards: document.querySelectorAll('.booking-size-card').length,
  brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
  horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
})`)
if (initial.code !== 'SM-B12' || initial.quantity !== '1' || initial.cards !== 4 || initial.brokenImages !== 0 || initial.horizontalOverflow) {
  throw new Error(`Initial state failed: ${JSON.stringify(initial)}`)
}
await capture('D:/WDP/screenshots/booking-e2e-desktop.png')

await clickText('Kho vừa')
await waitFor("document.querySelector('.booking-preview .eyebrow')?.textContent === 'MD-D04'", 'medium standard selection')
await clickText('Có điều hòa')
await waitFor("document.querySelector('.booking-preview .eyebrow')?.textContent === 'MD-E06'", 'medium climate selection')
await evaluate("document.querySelector('.quantity-stepper button:last-child').click()")
await waitFor("document.querySelector('.quantity-stepper output')?.textContent === '2'", 'quantity two')
await evaluate("document.querySelector('.booking-checkbox input').click()")
await clickText('Chọn thời gian')
await waitFor("document.querySelector('input[type=date]') !== null", 'schedule step')

const future = new Date()
future.setDate(future.getDate() + 45)
await setField('input[type=date]', future.toISOString().slice(0, 10))
await clickText('6')
await clickText('Kiểm tra tình trạng toàn kỳ')
await waitFor("document.querySelector('.booking-alert.is-error')?.textContent.includes('Dữ liệu hiện chỉ xác minh')", 'multi-unit unavailable result')

await clickText('Sửa lựa chọn kho')
await waitFor("document.querySelector('.quantity-stepper output')?.textContent === '2'", 'draft preserved after edit')
await evaluate("document.querySelector('.quantity-stepper button:first-child').click()")
await clickText('Kho nhỏ')
await waitFor("document.querySelector('.booking-preview .eyebrow')?.textContent === 'SM-B12'", 'small standard restored')
await clickText('Chọn thời gian')
const successDate = new Date()
successDate.setDate(successDate.getDate() + 550)
await setField('input[type=date]', successDate.toISOString().slice(0, 10))
await clickText('3')
await clickText('Kiểm tra tình trạng toàn kỳ')
await waitFor("document.querySelector('.booking-alert.is-success') !== null", 'full-period availability')
await clickText('Tiếp tục')
await waitFor("document.querySelector('.booking-account-gate') !== null", 'authentication gate')
await clickText('Tạo tài khoản')
await waitFor("document.querySelector('input[name=fullName]') !== null", 'registration page')

await setField('input[name=fullName]', 'Khách Giao Diện')
await setField('input[name=phone]', '0912345678')
await setField('input[name=email]', `ui-${Date.now()}@example.com`)
await setField('input[name=password]', 'Matkhau123')
await evaluate("document.querySelector('.auth-panel').requestSubmit()")
await waitFor("document.querySelector('.booking-submit-panel') !== null", 'review step after registration', 15000)

const review = await evaluate(`({
  hasCustomer: document.body.textContent.includes('Khách Giao Diện'),
  hasProduct: document.body.textContent.includes('Kho nhỏ B12'),
  hasQuote: document.body.textContent.includes('Chờ WDP báo giá'),
  draftDate: document.body.textContent.includes(${JSON.stringify(new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(successDate))})
})`)
if (!Object.values(review).every(Boolean)) throw new Error(`Review state failed: ${JSON.stringify(review)}`)

await evaluate("document.querySelector('.booking-submit-panel input[type=checkbox]').click()")
await clickText('Xác nhận và gửi yêu cầu')
await waitFor("location.pathname.startsWith('/booking/confirmation/') && document.querySelector('.confirmation-panel')?.textContent.includes('Đã tạo yêu cầu')", 'PENDING confirmation', 15000)
const confirmation = await evaluate(`({
  id: document.body.textContent.match(/WDP-\\d{4}-[A-F0-9]{6}/)?.[0],
  noPayment: document.body.textContent.includes('chưa thanh toán'),
  noAssignment: document.body.textContent.includes('phân kho vật lý')
})`)
if (!confirmation.id || !confirmation.noPayment || !confirmation.noAssignment) throw new Error(`Confirmation failed: ${JSON.stringify(confirmation)}`)

await clickText('Xem yêu cầu của tôi')
await waitFor("document.querySelectorAll('.reservation-list article').length === 1", 'My Reservations list')
await send('Page.reload', { ignoreCache: true })
await waitFor("document.querySelectorAll('.reservation-list article').length === 1", 'authenticated refresh')

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:5173/booking' })
await waitFor("document.querySelectorAll('.booking-size-card').length === 4", 'mobile booking page')
const mobile = await evaluate(`({
  innerWidth: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  cardWidth: Math.round(document.querySelector('.booking-size-card').getBoundingClientRect().width),
  progressWidth: Math.round(document.querySelector('.booking-progress').getBoundingClientRect().width),
  brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length
})`)
if (mobile.scrollWidth > mobile.innerWidth || mobile.cardWidth > mobile.innerWidth || mobile.progressWidth > mobile.innerWidth || mobile.brokenImages !== 0) {
  throw new Error(`Mobile layout failed: ${JSON.stringify(mobile)}`)
}
await capture('D:/WDP/screenshots/booking-e2e-mobile.png')

console.log(JSON.stringify({ initial, review, confirmation, mobile, result: 'PASS' }, null, 2))
socket.close()




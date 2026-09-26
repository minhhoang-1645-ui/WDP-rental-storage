import { writeFile } from 'node:fs/promises'

const devtools = 'http://127.0.0.1:9334'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const targetList = async () => fetch(devtools + '/json/list').then((response) => response.json())

let target
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    target = (await targetList()).find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1:5173/booking'))
    if (target) break
  } catch {}
  await pause(250)
}
if (!target) throw new Error('Edge DevTools did not become ready')

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

async function waitFor(expression, label, timeout = 12000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await pause(150)
  }
  throw new Error('Timed out waiting for ' + label)
}

async function clickText(text) {
  const found = await evaluate('(() => { const element = [...document.querySelectorAll("button,a")].find((item) => item.textContent?.includes(' + JSON.stringify(text) + ')); if (!element) return false; element.click(); return true })()')
  if (!found) throw new Error('Cannot find clickable text: ' + text)
}

async function setField(selector, value) {
  const changed = await evaluate('(() => { const element = document.querySelector(' + JSON.stringify(selector) + '); if (!element) return false; const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, ' + JSON.stringify(value) + '); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); return true })()')
  if (!changed) throw new Error('Cannot find field: ' + selector)
}

async function capture(path) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path, Buffer.from(result.data, 'base64'))
}

await send('Page.enable')
await send('Runtime.enable')
await waitFor('document.querySelectorAll(".booking-size-card").length === 4', 'four products')

const initial = await evaluate('({ steps: document.querySelectorAll(".booking-progress li").length, code: document.querySelector(".booking-preview .eyebrow")?.textContent, quantity: document.querySelector(".quantity-stepper output")?.textContent, broken: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length })')
if (initial.steps !== 3 || initial.code !== 'SM-B12' || initial.quantity !== '1' || initial.broken !== 0) throw new Error('Initial state failed: ' + JSON.stringify(initial))
await capture('D:/WDP/screenshots/booking-three-step-desktop.png')

await clickText('Kho vừa')
await waitFor('document.querySelector(".booking-preview .eyebrow")?.textContent === "MD-D04"', 'medium standard')
await clickText('Có điều hòa')
await waitFor('document.querySelector(".booking-preview .eyebrow")?.textContent === "MD-E06"', 'medium climate')
await evaluate('document.querySelector(".quantity-stepper button:last-child").click()')
await waitFor('document.querySelector(".quantity-stepper output")?.textContent === "2"', 'two units')
await evaluate('document.querySelector(".booking-checkbox input").click()')
await clickText('Chọn thời gian')
await waitFor('document.querySelector(".period-mode-tabs") !== null', 'step two')

const start = new Date()
start.setDate(start.getDate() + 120)
const end = new Date()
end.setDate(end.getDate() + 127)
const startValue = start.toISOString().slice(0, 10)
const endValue = end.toISOString().slice(0, 10)
await clickText('Theo ngày kết thúc')
await setField('input[type=date]', startValue)
await setField('input[name=endDate]', endValue)
await clickText('Kiểm tra tình trạng toàn kỳ')
await waitFor('document.querySelector(".booking-alert.is-error") !== null', 'multi-unit unavailable')

await clickText('Sửa lựa chọn kho')
await evaluate('document.querySelector(".quantity-stepper button:first-child").click()')
await clickText('Kho nhỏ')
await clickText('Chọn thời gian')
await clickText('Theo thời hạn')
await setField('input[type=date]', startValue)
await clickText('3')
await clickText('Kiểm tra tình trạng toàn kỳ')
await waitFor('document.querySelector(".booking-alert.is-success") !== null', 'available period')
const verifiedDetails = await evaluate('({ hasStart: document.body.textContent.includes("Ngày bắt đầu"), hasEnd: document.body.textContent.includes("Ngày kết thúc sử dụng"), hasQuantity: document.body.textContent.includes("Số lượng"), hasQuote: document.body.textContent.includes("Cần xác nhận báo giá") })')
if (!verifiedDetails.hasStart || !verifiedDetails.hasEnd || !verifiedDetails.hasQuantity || !verifiedDetails.hasQuote) throw new Error('Step 2 summary missing details: ' + JSON.stringify(verifiedDetails))
const changedStart = new Date(start)
changedStart.setDate(changedStart.getDate() + 1)
await setField('input[name=startDate]', changedStart.toISOString().slice(0, 10))
await waitFor('document.querySelector(".booking-alert.is-success") === null && document.querySelector(".booking-summary button.button-primary")?.disabled === true', 'availability invalidated after date change')
await setField('input[name=startDate]', startValue)
await clickText('Kiểm tra tình trạng toàn kỳ')
await waitFor('document.querySelector(".booking-alert.is-success") !== null', 'fresh available period')
await send('Page.reload')
await waitFor('document.querySelector(".period-mode-tabs") !== null && document.querySelector(".booking-alert.is-success") !== null', 'availability restored after refresh')
const shortEnd = new Date(start)
shortEnd.setDate(shortEnd.getDate() + 7)
await clickText('Theo ngày kết thúc')
await setField('input[name=startDate]', startValue)
await setField('input[name=endDate]', shortEnd.toISOString().slice(0, 10))
await clickText('Kiểm tra tình trạng toàn kỳ')
await waitFor('document.querySelector(".booking-alert.is-success") !== null', 'short custom date range available')
const shortRange = await evaluate('document.body.textContent.includes("Thời hạn dưới một tháng chưa có chính sách giá") && document.querySelector(".booking-summary button.button-primary")?.disabled === false')
if (!shortRange) throw new Error('Short custom range was not eligible for quotation-only checkout')
await clickText('Theo thời hạn')
await clickText('3')
await clickText('Kiểm tra tình trạng toàn kỳ')
await waitFor('document.querySelector(".booking-alert.is-success") !== null', 'approved duration rechecked')
const addonStep = await evaluate('document.body.textContent.includes("Chưa có dịch vụ bổ sung được WDP duyệt")')
if (!addonStep) throw new Error('Add-on disclosure missing')
await clickText('Tiếp tục')
await waitFor('document.querySelector(".checkout-layout") !== null', 'checkout step')

const checkout = await evaluate('({ payNowDisabled: document.querySelectorAll(".payment-option.is-disabled").length === 1, hasQuote: document.body.textContent.includes("Cần xác nhận báo giá") })')
if (!checkout.payNowDisabled || !checkout.hasQuote) throw new Error('Checkout state failed: ' + JSON.stringify(checkout))

await setField('input[autocomplete=name]', 'Khách Giao Diện')
await setField('input[autocomplete=tel]', '0912345678')
await setField('input[autocomplete=email]', 'guest-ui-' + Date.now() + '@example.com')
await clickText('Gửi yêu cầu liên hệ')
await waitFor('document.querySelector(".confirmation-panel")?.textContent.includes("Đã gửi yêu cầu liên hệ")', 'guest inquiry confirmation')
const confirmation = await evaluate('({ hasCode: document.body.textContent.match(/WDPQ-\\d{4}-[A-F0-9]{6}/)?.[0] !== undefined, noGuarantee: document.body.textContent.includes("Không đảm bảo tồn kho") })')
if (!confirmation.hasCode || !confirmation.noGuarantee) throw new Error('Confirmation failed: ' + JSON.stringify(confirmation))

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:5173/booking' })
await waitFor('document.querySelectorAll(".booking-size-card").length === 4', 'mobile booking')
const mobile = await evaluate('({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, progressWidth: document.querySelector(".booking-progress").getBoundingClientRect().width, broken: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length })')
if (mobile.scrollWidth > mobile.width || mobile.progressWidth > mobile.width || mobile.broken !== 0) throw new Error('Mobile state failed: ' + JSON.stringify(mobile))
await capture('D:/WDP/screenshots/booking-three-step-mobile.png')

console.log(JSON.stringify({ initial, checkout, confirmation, mobile, result: 'PASS' }, null, 2))
socket.close()



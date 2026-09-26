import { writeFile } from 'node:fs/promises'

const devtools = 'http://127.0.0.1:9335'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const targets = async () => fetch(devtools + '/json/list').then((response) => response.json())

let target
for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    target = (await targets()).find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1:5173/booking'))
    if (target) break
  } catch {}
  await pause(200)
}
if (!target) throw new Error('Booking tab did not become ready')

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
    await pause(100)
  }
  throw new Error('Timed out waiting for ' + label)
}

async function setViewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  await pause(250)
}

async function capture(path) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path, Buffer.from(result.data, 'base64'))
}

async function clickText(text) {
  const clicked = await evaluate(`(() => { const item = [...document.querySelectorAll('button,a')].find((element) => element.textContent?.trim().includes(${JSON.stringify(text)}) && !element.disabled); if (!item) return false; item.click(); return true })()`)
  if (!clicked) throw new Error('Cannot click ' + text)
}

async function setField(selector, value) {
  const changed = await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  if (!changed) throw new Error('Cannot set ' + selector)
}

await send('Page.enable')
await send('Runtime.enable')
await evaluate('localStorage.clear()')
await send('Page.navigate', { url: 'http://127.0.0.1:5173/booking' })
await waitFor('document.querySelectorAll(".booking-size-card").length === 4', 'Step 1 cards')

await setViewport(1440, 960)
const desktop = await evaluate(`(() => { const grid = document.querySelector('.booking-step-grid'); const left = grid.children[0].getBoundingClientRect(); const preview = document.querySelector('.booking-preview').getBoundingClientRect(); const visual = document.querySelector('.booking-preview-visual').getBoundingClientRect(); return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, leftBottom: Math.round(left.bottom), previewTop: Math.round(preview.top), previewHeight: Math.round(preview.height), visualHeight: Math.round(visual.height), previewLeft: Math.round(preview.left), leftLeft: Math.round(left.left) } })()`)
if (desktop.columns < 2 || desktop.visualHeight < 180 || desktop.visualHeight > 220 || desktop.previewLeft <= desktop.leftLeft || desktop.previewHeight > 620) throw new Error('Desktop compact preview failed: ' + JSON.stringify(desktop))
await capture('D:/WDP/screenshots/booking-step1-1440.png')

await setViewport(1024, 900)
const tablet1024 = await evaluate(`(() => { const grid = document.querySelector('.booking-step-grid'); const left = grid.children[0].getBoundingClientRect(); const preview = document.querySelector('.booking-preview').getBoundingClientRect(); return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, previewTop: Math.round(preview.top), leftBottom: Math.round(left.bottom), scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth } })()`)
if (tablet1024.columns !== 1 || tablet1024.previewTop < tablet1024.leftBottom || tablet1024.scrollWidth > tablet1024.width) throw new Error('1024 single-column layout failed: ' + JSON.stringify(tablet1024))
await capture('D:/WDP/screenshots/booking-step1-1024.png')

await setViewport(885, 900)
const tablet885 = await evaluate(`(() => { const grid = document.querySelector('.booking-step-grid'); const left = grid.children[0].getBoundingClientRect(); const preview = document.querySelector('.booking-preview').getBoundingClientRect(); return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, previewTop: Math.round(preview.top), leftBottom: Math.round(left.bottom), scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth } })()`)
if (tablet885.columns !== 1 || tablet885.previewTop < tablet885.leftBottom || tablet885.scrollWidth > tablet885.width) throw new Error('885 single-column layout failed: ' + JSON.stringify(tablet885))
await capture('D:/WDP/screenshots/booking-step1-885.png')

await setViewport(390, 844, true)
const mobile = await evaluate(`(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth, visualHeight: Math.round(document.querySelector('.booking-preview-visual').getBoundingClientRect().height), cta: Boolean(document.querySelector('.booking-preview-cta')) }))()`)
if (mobile.scrollWidth > mobile.width || mobile.visualHeight > 190 || !mobile.cta) throw new Error('Mobile compact layout failed: ' + JSON.stringify(mobile))
await capture('D:/WDP/screenshots/booking-step1-mobile.png')

await setViewport(1440, 960)
await clickText('Chọn thời gian')
await waitFor('document.querySelector(".period-mode-tabs") !== null', 'Step 2')
const today = new Date()
today.setDate(today.getDate() + 120)
const dates = [0, 1, 2].map((offset) => { const value = new Date(today); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10) })
await setField('input[name=startDate]', dates[0])
await pause(50)
await setField('input[name=startDate]', dates[1])
await pause(50)
await setField('input[name=startDate]', dates[2])
await waitFor('document.querySelector(".availability-status.is-checking") !== null', 'automatic checking state')
await waitFor('document.querySelector(".availability-status.is-available") !== null', 'automatic available state')
const automatic = await evaluate(`(() => ({ manualButton: [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Kiểm tra tình trạng toàn kỳ')), start: document.querySelector('input[name=startDate]').value, continueEnabled: !document.querySelector('.booking-summary .button-primary').disabled, formStatus: document.querySelector('.booking-form-panel .availability-status')?.textContent, summaryStatus: document.querySelector('.booking-summary .availability-status')?.textContent }))()`)
if (automatic.manualButton || automatic.start !== dates[2] || !automatic.continueEnabled || !automatic.formStatus.includes('Còn kho phù hợp') || !automatic.summaryStatus.includes('Còn kho phù hợp')) throw new Error('Automatic availability success failed: ' + JSON.stringify(automatic))

await evaluate(`(() => { window.__bookingSmokeFetch = window.fetch; window.__bookingSmokeFail = true; window.fetch = async (...args) => { if (window.__bookingSmokeFail && String(args[0]).includes('/booking/availability')) { window.__bookingSmokeFail = false; throw new TypeError('temporary test failure') } return window.__bookingSmokeFetch(...args) } })()`)
const errorDate = new Date(today)
errorDate.setDate(errorDate.getDate() + 4)
await setField('input[name=startDate]', errorDate.toISOString().slice(0, 10))
await waitFor('document.querySelector(".availability-status.is-error") !== null', 'temporary API error state')
const errorState = await evaluate(`(() => ({ text: document.querySelector('.booking-form-panel .availability-status')?.textContent, retry: [...document.querySelectorAll('.availability-status button')].some((button) => button.textContent?.includes('Thử lại')), continueDisabled: document.querySelector('.booking-summary .button-primary').disabled }))()`)
if (!errorState.text.includes('Không thể kiểm tra lúc này') || !errorState.retry || !errorState.continueDisabled) throw new Error('API error handling failed: ' + JSON.stringify(errorState))
await evaluate('window.fetch = window.__bookingSmokeFetch')
await clickText('Thử lại')
await waitFor('document.querySelector(".availability-status.is-available") !== null', 'retry available state')

await clickText('Sửa lựa chọn kho')
await evaluate('document.querySelector(".quantity-stepper button:last-child").click()')
await clickText('Chọn thời gian')
await waitFor('document.querySelector(".availability-status.is-unavailable") !== null', 'unavailable quantity state')
const unavailable = await evaluate(`(() => ({ continueDisabled: document.querySelector('.booking-summary .button-primary').disabled, text: document.querySelector('.booking-summary .availability-status')?.textContent, savedDate: document.querySelector('input[name=startDate]').value }))()`)
if (!unavailable.continueDisabled || !unavailable.text.includes('Không còn kho phù hợp') || !unavailable.savedDate) throw new Error('Unavailable state failed: ' + JSON.stringify(unavailable))

console.log(JSON.stringify({ desktop, tablet1024, tablet885, mobile, automatic, errorState, unavailable, result: 'PASS' }, null, 2))
socket.close()
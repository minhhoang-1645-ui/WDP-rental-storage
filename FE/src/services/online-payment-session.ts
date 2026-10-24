export type PendingOnlinePayment = {
  customerId: string
  invoiceId: string
  invoiceCode: string
  transactionId: string
  merchantOrderRef: string
  amount: number
  mode: 'VNPAY' | 'VNPAYQR'
  createdAt: string
}

const PREFIX = 'wdp-vnpay-pending-v1:'

function key(customerId: string, invoiceId: string) {
  return `${PREFIX}${customerId}:${invoiceId}`
}

function valid(value: unknown): value is PendingOnlinePayment {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<PendingOnlinePayment>
  return typeof item.customerId === 'string'
    && typeof item.invoiceId === 'string'
    && typeof item.invoiceCode === 'string'
    && typeof item.transactionId === 'string'
    && typeof item.merchantOrderRef === 'string'
    && Number.isSafeInteger(item.amount)
    && Number(item.amount) > 0
    && (item.mode === 'VNPAY' || item.mode === 'VNPAYQR')
    && typeof item.createdAt === 'string'
}

export function savePendingOnlinePayment(value: PendingOnlinePayment) {
  localStorage.setItem(key(value.customerId, value.invoiceId), JSON.stringify(value))
}

export function readPendingOnlinePayments(customerId: string) {
  const items: PendingOnlinePayment[] = []
  const prefix = `${PREFIX}${customerId}:`
  for (let index = 0; index < localStorage.length; index++) {
    const storageKey = localStorage.key(index)
    if (!storageKey?.startsWith(prefix)) continue
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (valid(value) && value.customerId === customerId) items.push(value)
    } catch { /* Ignore corrupt browser state. */ }
  }
  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function removePendingOnlinePayment(value: Pick<PendingOnlinePayment, 'customerId' | 'invoiceId'>) {
  localStorage.removeItem(key(value.customerId, value.invoiceId))
}

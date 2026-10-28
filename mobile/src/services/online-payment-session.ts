import * as SecureStore from 'expo-secure-store';

export type PendingOnlinePayment = {
  customerId: string;
  invoiceId: string;
  invoiceCode: string;
  transactionId: string;
  merchantOrderRef: string;
  amount: number;
  expiresAt: string;
  mode: 'VNPAY' | 'VNPAYQR';
  createdAt: string;
};

const prefix = 'wdp-vnpay-pending-v1:';
const key = (customerId: string) => `${prefix}${customerId}`;

function valid(value: unknown): value is PendingOnlinePayment {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PendingOnlinePayment>;
  return typeof item.customerId === 'string' && typeof item.invoiceId === 'string' && typeof item.invoiceCode === 'string'
    && typeof item.transactionId === 'string' && typeof item.merchantOrderRef === 'string'
    && Number.isSafeInteger(item.amount) && Number(item.amount) > 0 && typeof item.expiresAt === 'string'
    && (item.mode === 'VNPAY' || item.mode === 'VNPAYQR') && typeof item.createdAt === 'string';
}

export async function readPendingOnlinePayment(customerId: string) {
  try {
    const value: unknown = JSON.parse(await SecureStore.getItemAsync(key(customerId)) ?? 'null');
    return valid(value) && value.customerId === customerId ? value : null;
  } catch { return null; }
}

export const savePendingOnlinePayment = (payment: PendingOnlinePayment) => SecureStore.setItemAsync(key(payment.customerId), JSON.stringify(payment));
export const removePendingOnlinePayment = (customerId: string) => SecureStore.deleteItemAsync(key(customerId));

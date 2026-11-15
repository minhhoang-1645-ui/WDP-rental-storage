import { safeLocalStorage, safeSessionStorage } from '../services/browser-storage';

export const SESSION_ENDED_EVENT = 'wdp-session-ended';
const legacyNoticeKey = 'wdp-session-expired';
const notice = {
  ACCOUNT_DISABLED: 'Tài khoản đã bị vô hiệu hóa.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.',
  SESSION_INVALID: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.',
};
export type SessionEndReason = keyof typeof notice;

export function sessionEndReason(payload: unknown): SessionEndReason {
  if (payload && typeof payload === 'object') {
    if ('code' in payload && (payload.code === 'ACCOUNT_DISABLED' || payload.code === 'SESSION_EXPIRED' || payload.code === 'SESSION_INVALID')) return payload.code;
    if ('message' in payload && typeof payload.message === 'string' && /^Tài khoản (?:của bạn )?đã bị vô hiệu hóa[.!]?$/iu.test(payload.message.trim())) return 'ACCOUNT_DISABLED';
  }
  return 'SESSION_INVALID';
}

export function markSessionEnded(reason: SessionEndReason) {
  safeSessionStorage.setItem(SESSION_ENDED_EVENT, reason);
  safeLocalStorage.setItem(SESSION_ENDED_EVENT, reason);
}

export function syncSessionEndNotice() {
  const reason = safeLocalStorage.getItem(SESSION_ENDED_EVENT);
  if (reason) safeSessionStorage.setItem(SESSION_ENDED_EVENT, reason);
  else safeSessionStorage.removeItem(SESSION_ENDED_EVENT);
}

export function clearSessionEndNotice() {
  safeSessionStorage.removeItem(SESSION_ENDED_EVENT);
  safeLocalStorage.removeItem(SESSION_ENDED_EVENT);
  safeSessionStorage.removeItem(legacyNoticeKey);
  safeLocalStorage.removeItem(legacyNoticeKey);
}

export function readSessionEndNotice() {
  const reason = safeSessionStorage.getItem(SESSION_ENDED_EVENT);
  if (reason === 'ACCOUNT_DISABLED' || reason === 'SESSION_EXPIRED' || reason === 'SESSION_INVALID') return notice[reason];
  const legacy = safeSessionStorage.getItem(legacyNoticeKey);
  return legacy === 'ACCOUNT_DISABLED' ? notice.ACCOUNT_DISABLED : legacy ? notice.SESSION_INVALID : '';
}

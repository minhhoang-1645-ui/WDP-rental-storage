import { roleNamespace } from '../role-names';
import { createContext, useContext } from 'react';
import { internalPageSize } from '../utils/internal-pagination';

export type NotificationRole = 'FACILITY_STAFF' | 'FACILITY_MANAGER' | 'SYSTEM_ADMINISTRATOR' | 'STORAGE_CUSTOMER' | 'BUSINESS_OPERATIONS_MANAGER';
export type NoticeView = 'all' | 'unread' | 'action';
export type Notice = {
  token: string;
  kind: string;
  title: string;
  summary: string;
  at: string;
  unread: boolean;
  actionLabel: string;
  important: boolean;
  canOpen: boolean;
};
export type NotificationPage = {
  page: number; limit: number; total: number; unreadTotal: number;
  items: Notice[]; recent: Notice[]; kinds: { value: string; label: string }[];
};
export const noticeViews: [NoticeView, string][] = [['all', 'Tất cả'], ['unread', 'Chưa đọc'], ['action', 'Cần xử lý']];

type NotificationState = {
  data: NotificationPage | null;
  recent: Notice[];
  setPreviewOpen: (open: boolean) => void;
  kinds: NotificationPage['kinds'];
  unread: number | null;
  loading: boolean;
  updating: boolean;
  error: string;
  operationError: string;
  busy: boolean;
  refresh: () => void;
  mark: (notice: Notice) => Promise<void>;
  markAll: () => Promise<void>;
  open: (notice: Notice) => Promise<void>;
};
export const NotificationContext = createContext<NotificationState | null>(null);
export const useNotifications = () => useContext(NotificationContext);
export const workspaceInboxPath = (role: NotificationRole) => `/${roleNamespace(role)}/notifications`;

export function noticeQuery(search: string) {
  const params = new URLSearchParams(search);
  const candidate = params.get('view');
  const view = noticeViews.find(([value]) => value === candidate)?.[0] ?? 'all';
  const page = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(params.get('page'))) || 1));
  const limit = internalPageSize(params);
  return { view, page, limit, kind: params.get('kind') ?? '', search: (params.get('search') ?? '').slice(0, 100) };
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { ArrowLeftRight, Bell, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, CreditCard, FileText, Headphones, PackageCheck, ReceiptText, RefreshCw, TriangleAlert, Wallet, Warehouse, X, type LucideIcon } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { ApiError, apiRequest } from '@/services/api';
import { refreshScreens, subscribeDataChanged } from '@/services/live-events';
import { customerNotificationTarget } from '@/utils/customer-notification-target';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { EmptyState, ErrorState, LoadingState } from './screen-state';

type Notice = {
  token: string; kind: string; title: string; summary: string; at: string;
  actionLabel: string; canOpen: boolean; unread: boolean;
};
type NoticePage = { items: Notice[]; page: number; limit: number; total: number; unreadTotal: number };
const endpoint = '/notifications';
const inbox = endpoint + '?client=mobile';
const filters = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unread', label: 'Chưa đọc' },
  { value: 'action', label: 'Cần thực hiện' },
] as const;
type Filter = (typeof filters)[number]['value'];

const icons: Record<string, LucideIcon> = {
  reservations: ClipboardList, contracts: FileText, appointments: CalendarDays,
  invoices: ReceiptText, payments: CreditCard, rentals: Warehouse, 'payment-submissions': CreditCard, renewals: RefreshCw,
  transfers: ArrowLeftRight, 'transfer-orders': ArrowLeftRight,
  returns: PackageCheck, 'early-returns': PackageCheck, 'deposit-settlements': Wallet,
  'support-requests': Headphones, 'damage-claims': TriangleAlert,
};
const vietnamTime = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const dayKey = new Intl.DateTimeFormat('vi-VN', { ...vietnamTime, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeLabel = new Intl.DateTimeFormat('vi-VN', { ...vietnamTime, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const hourLabel = new Intl.DateTimeFormat('vi-VN', { ...vietnamTime, hour: '2-digit', minute: '2-digit' });
function formatNoticeTime(at: string, now: number) {
  const value = Date.parse(at);
  if (!Number.isFinite(value)) return '—';
  const group = groupFor(at, now);
  return group === 'Trước đó' ? timeLabel.format(value) : group + ', ' + hourLabel.format(value);
}
function groupFor(at: string, now: number) {
  const value = Date.parse(at);
  if (!Number.isFinite(value)) return 'Trước đó';
  const day = dayKey.format(value);
  if (day === dayKey.format(now)) return 'Hôm nay';
  if (day === dayKey.format(now - 86_400_000)) return 'Hôm qua';
  return 'Trước đó';
}
const notificationContext = createContext<{ unread: number; open: () => void }>({ unread: 0, open: () => {} });

export function CustomerNotificationProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  const badge = useResource<NoticePage>(inbox + '&limit=5', false, true);
  const { refresh: refreshBadge } = badge;
  const previous = useRef<string | undefined>(undefined);
  const [inboxCounts, setInboxCounts] = useState<{ unread: number; total?: number }>();
  const unread = inboxCounts?.unread ?? badge.data?.unreadTotal ?? 0;
  const updateCounts = useCallback((nextUnread: number, total?: number) => {
    setInboxCounts(previous => ({ unread: nextUnread, total: total ?? previous?.total }));
  }, []);
  const recent = badge.data?.items;
  useEffect(() => {
    if (!recent) return;
    const latest = JSON.stringify(recent.map(item => [item.token, item.actionLabel]));
    if (previous.current !== undefined && previous.current !== latest) refreshScreens();
    previous.current = latest;
  }, [recent]);
  useEffect(() => subscribeDataChanged(refreshBadge), [refreshBadge]);
  useEffect(() => {
    if (opened) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refreshBadge();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refreshBadge, opened]);

  return <notificationContext.Provider value={{ unread, open: () => setOpened(true) }}>
    {children}
    {opened && <NotificationInbox knownTotal={inboxCounts?.total ?? badge.data?.total} knownUnread={unread}
      onCount={updateCounts} onClose={() => { refreshBadge(); setInboxCounts(undefined); setOpened(false); }} />}
  </notificationContext.Provider>;
}

export function CustomerNotifications({ inverse = false, label }: { inverse?: boolean; label?: string }) {
  const { unread, open } = useContext(notificationContext);
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? ('Thông báo, ' + unread + ' chưa đọc')}
    onPress={open} style={({ pressed }) => [s.iconButton, pressed && s.pressed]}>
    {label ? <Text style={s.actionText}>{label}</Text> : <Bell size={22} color={inverse ? 'white' : C.navy} />}
    {!label && unread > 0 && <View style={s.bellDot} />}
  </Pressable>;
}

function NotificationInbox({ onCount, onClose, knownTotal, knownUnread }: {
  onCount: (count: number, total?: number) => void; onClose: () => void; knownTotal?: number; knownUnread: number;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [clock, setClock] = useState(Date.now);
  const [notice, setNotice] = useState<Notice>();
  const [operationError, setOperationError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const source = useResource<NoticePage>(inbox + '&limit=20&view=' + filter + '&page=' + page);
  const { data, refresh: refreshPage } = source;
  const { data: actionCount, refresh: refreshActionCount } = useResource<NoticePage>(inbox + '&limit=5&view=action', false, true);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !lock.current) { setClock(Date.now()); refreshPage(); refreshActionCount(); }
    }, 60_000);
    return () => clearInterval(timer);
  }, [refreshPage, refreshActionCount]);
  const rows = [...new Map((data?.items ?? []).map(item => [item.token, item])).values()]
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  useEffect(() => {
    if (data) onCount(data.unreadTotal, filter === 'all' ? data.total : undefined);
  }, [data, filter, onCount]);

  function refresh() {
    setClock(Date.now());
    setOperationError('');
    source.refresh();
    refreshActionCount();
  }

  async function write(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setOperationError('');
    try {
      await action();
      source.refresh();
      refreshActionCount();
    } catch (error) {
      setOperationError(error instanceof ApiError && error.status === 404 ? 'Hồ sơ không còn khả dụng. Danh sách đang được cập nhật.'
        : error instanceof Error ? error.message : 'Chưa cập nhật được thông báo. Vui lòng thử lại.');
      if (error instanceof ApiError && error.status === 404) source.refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function open(item: Notice) {
    void write(async () => {
      const path = endpoint + '/' + encodeURIComponent(item.token);
      if (!item.canOpen) {
        await apiRequest(path + '/read', { method: 'PATCH' });
        setNotice({ ...item, unread: false });
        return;
      }
      const result = await apiRequest<{ target?: string }>(path + '/open?client=mobile', { method: 'POST' });
      const target = customerNotificationTarget(result?.target ?? '', item.kind);
      if (!target) {
        setNotice({ ...item, unread: false, canOpen: false, actionLabel: '' });
        return;
      }
      onClose();
      router.push(target as Href);
    });
  }

  const unread = data?.unreadTotal ?? knownUnread;
  const counts = { all: filter === 'all' && data ? data.total : knownTotal, unread, action: filter === 'action' && data ? data.total : actionCount?.total };
  const visiblePage = data?.page ?? page;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const empty = filter === 'unread' ? 'Bạn đã đọc hết thông báo' : filter === 'action' ? 'Không có việc cần thực hiện' : 'Chưa có thông báo';

  return <Modal visible presentationStyle="fullScreen" animationType="slide" onRequestClose={() => { if (notice) setNotice(undefined); else if (!busy) onClose(); }}>
    <SafeAreaProvider style={s.screen}><SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={s.screen}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={notice ? 'Về danh sách thông báo' : 'Đóng thông báo'}
          disabled={busy} onPress={() => { if (notice) setNotice(undefined); else onClose(); }} style={s.iconButton}>
          {notice ? <ChevronLeft size={22} color={C.navy} /> : <X size={21} color={C.navy} />}
        </Pressable>
        <Text accessibilityRole="header" style={s.title}>Thông báo</Text>
        <View style={s.iconButton} />
      </View>
      {notice ? <View style={s.detail}>
        <Text accessibilityRole="header" style={s.rowTitle}>{notice.title}</Text>
        {notice.summary ? <Text style={s.preview}>{notice.summary}</Text> : null}
        <Text style={s.time}>{formatNoticeTime(notice.at, clock)}</Text>
      </View> : <>
        <View style={s.toolbar}>
          <View style={s.filters}>{filters.map(option => {
            const active = filter === option.value;
            return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: active }}
              disabled={busy}
              onPress={() => { setFilter(option.value); setPage(1); setOperationError(''); }}
              style={[s.filterTap, active && s.filterTapActive]}>
              <Text style={[s.filterText, active && s.filterTextActive]}>{option.label}{counts[option.value] === undefined ? '' : ' ' + counts[option.value]}</Text>
            </Pressable>;
          })}</View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || unread === 0 }} disabled={busy || unread === 0}
            onPress={() => void write(async () => {
              await apiRequest(endpoint + '/read-all', { method: 'PATCH' });
              setPage(1);
            })} style={s.readAll}>
            <Text style={[s.actionText, (busy || !unread) && s.muted]}>{busy ? 'Đang cập nhật…' : 'Đánh dấu tất cả đã đọc'}</Text>
          </Pressable>
        </View>
        {operationError ? <Text accessibilityRole="alert" style={s.error}>{operationError}</Text> : null}
        <FlatList data={rows} keyExtractor={item => item.token} refreshing={source.loading && !operationError} onRefresh={refresh}
          contentContainerStyle={s.list} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={source.error ? <ErrorState message={source.error} onRetry={refresh} />
            : source.loading ? <LoadingState layout="list" /> : <EmptyState title={empty} message="" />}
          ListFooterComponent={pages > 1 ? <View style={s.paging}>
            <Pressable accessibilityRole="button" accessibilityLabel="Trang trước" disabled={busy || visiblePage <= 1}
              onPress={() => setPage(visiblePage - 1)} style={s.iconButton}><ChevronLeft size={21} color={visiblePage <= 1 ? C.muted : C.cobalt} /></Pressable>
            <Text style={s.time}>{visiblePage} / {pages}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Trang sau" disabled={busy || visiblePage >= pages}
              onPress={() => setPage(visiblePage + 1)} style={s.iconButton}><ChevronRight size={21} color={visiblePage >= pages ? C.muted : C.cobalt} /></Pressable>
          </View> : undefined}
          renderItem={({ item, index }) => {
            const Icon = icons[item.kind] ?? Bell;
            const group = groupFor(item.at, clock);
            return <>
              {(index === 0 || group !== groupFor(rows[index - 1].at, clock)) &&
                <Text accessibilityRole="header" style={s.group}>{group}</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel={[item.unread ? 'Chưa đọc' : '', item.title, item.summary, formatNoticeTime(item.at, clock), item.actionLabel].filter(Boolean).join('. ')}
                disabled={busy} onPress={() => open(item)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
                <View style={s.category}><Icon size={19} color={C.cobalt} /></View>
                <View style={[s.content, index !== rows.length - 1 && s.divider]}>
                  <Text numberOfLines={2} style={[s.rowTitle, item.unread && s.unreadTitle]}>{item.title}</Text>
                  {item.summary ? <Text numberOfLines={2} style={s.preview}>{item.summary}</Text> : null}
                  <View style={s.metadata}>
                    <Text style={s.time}>{formatNoticeTime(item.at, clock)}</Text>
                    {item.actionLabel ? <Text style={s.actionText}>·  {item.actionLabel}</Text> : null}
                  </View>
                </View>
                {item.unread ? <View style={s.unreadDot} /> : item.canOpen && !item.actionLabel
                  ? <ChevronRight size={14} color={C.muted} /> : <View style={s.dotSpace} />}
              </Pressable>
            </>;
          }}
        />
      </>}
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  header: { paddingHorizontal: 12, flexDirection: 'row', minHeight: 48, alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.cobalt, fontSize: 21, fontWeight: '800' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: C.cobalt },
  pressed: { opacity: 0.65 },
  toolbar: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 6 },
  filters: { flexDirection: 'row', padding: 2, gap: 2, borderRadius: 13, backgroundColor: '#EAF0FC' },
  filterTap: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 3, paddingVertical: 3 },
  filterTapActive: { backgroundColor: C.cobalt },
  filterText: { color: C.cobalt, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  filterTextActive: { color: 'white' },
  readAll: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  actionText: { color: C.cobalt, fontSize: 13, fontWeight: '700' },
  list: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  group: { color: '#415167', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginTop: 8, marginBottom: 2 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8, gap: 11 },
  category: { width: 42, height: 42, borderRadius: 11, backgroundColor: '#EAF0FC', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  content: { flex: 1, minWidth: 0, gap: 3, paddingBottom: 8 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  unreadTitle: { fontWeight: '800' },
  preview: { color: C.muted, fontSize: 13, lineHeight: 18 },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 },
  time: { color: C.muted, fontSize: 12, lineHeight: 17 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.cobalt, marginTop: 7 },
  dotSpace: { width: 7 },
  muted: { color: C.muted },
  detail: { padding: 20, gap: 10 },
  paging: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 8 },
  error: { color: C.danger, marginHorizontal: 16, marginVertical: 10, fontSize: 13 },
});

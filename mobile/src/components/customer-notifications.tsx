import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { ArrowLeftRight, Bell, Box, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, CreditCard, FileText, Headphones, PackageCheck, RefreshCw, TriangleAlert, Wallet, X, type LucideIcon } from 'lucide-react-native';
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
  invoices: CreditCard, 'payment-submissions': CreditCard, renewals: RefreshCw,
  'stock-movements': Box, transfers: ArrowLeftRight, 'transfer-orders': ArrowLeftRight,
  returns: PackageCheck, 'early-returns': PackageCheck, 'deposit-settlements': Wallet,
  'support-requests': Headphones, 'damage-claims': TriangleAlert,
};
const dayKey = new Intl.DateTimeFormat('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
const timeLabel = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function formatNoticeTime(at: string) {
  const value = Date.parse(at);
  return Number.isFinite(value) ? timeLabel.format(value) : '—';
}
function groupFor(at: string, now: number) {
  const value = Date.parse(at);
  if (!Number.isFinite(value)) return 'Trước đó';
  const day = dayKey.format(value);
  if (day === dayKey.format(now)) return 'Hôm nay';
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (day === dayKey.format(yesterday)) return 'Hôm qua';
  return 'Trước đó';
}
const notificationContext = createContext<{ unread: number; open: () => void }>({ unread: 0, open: () => {} });

export function CustomerNotificationProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  const badge = useResource<NoticePage>(inbox + '&limit=5', false, true);
  const previous = useRef<string | undefined>(undefined);
  const [inboxCount, setInboxCount] = useState<number>();
  const unread = inboxCount ?? badge.data?.unreadTotal ?? 0;
  const recent = badge.data?.items;
  useEffect(() => {
    if (!recent) return;
    const latest = JSON.stringify(recent.map(item => [item.token, item.actionLabel]));
    if (previous.current !== undefined && previous.current !== latest) refreshScreens();
    previous.current = latest;
  }, [recent]);
  useEffect(() => subscribeDataChanged(() => badge.refresh()), [badge.refresh]);
  useEffect(() => {
    if (opened) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') badge.refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [badge.refresh, opened]);

  return <notificationContext.Provider value={{ unread, open: () => { setInboxCount(badge.data?.unreadTotal); setOpened(true); } }}>
    {children}
    {opened && <NotificationInbox onCount={setInboxCount} onClose={() => { badge.refresh(); setInboxCount(undefined); setOpened(false); }} />}
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

function NotificationInbox({ onCount, onClose }: { onCount: (count: number) => void; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [clock, setClock] = useState(Date.now);
  const [notice, setNotice] = useState<Notice>();
  const [operationError, setOperationError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const source = useResource<NoticePage>(inbox + '&limit=20&view=' + filter + '&page=' + page);
  const { data } = source;
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !lock.current) { setClock(Date.now()); source.refresh(); }
    }, 60_000);
    return () => clearInterval(timer);
  }, [source.refresh]);
  const rows = data?.items ?? [];
  useEffect(() => {
    if (data) onCount(data.unreadTotal);
  }, [data, onCount]);

  function refresh() {
    setClock(Date.now());
    setOperationError('');
    source.refresh();
  }

  async function write(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setOperationError('');
    try {
      await action();
      source.refresh();
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

  const unread = data?.unreadTotal ?? 0;
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
        <Text style={s.time}>{formatNoticeTime(notice.at)}</Text>
        <Text style={s.preview}>Hồ sơ liên quan hiện không mở được từ thông báo này.</Text>
      </View> : <>
        <View style={s.toolbar}>
          <View style={s.filters}>{filters.map(option => {
            const active = filter === option.value;
            return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: active }}
              onPress={() => { setFilter(option.value); setPage(1); setOperationError(''); }}
              style={[s.filterTap, active && s.filterTapActive]}>
              <Text style={[s.filterText, active && s.filterTextActive]}>{option.label}</Text>
            </Pressable>;
          })}</View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || unread === 0 }} disabled={busy || unread === 0}
            onPress={() => void write(async () => {
              await apiRequest(endpoint + '/read-all', { method: 'PATCH' });
              setPage(1);
            })} style={s.readAll}>
            <Text style={[s.actionText, (busy || !unread) && s.muted]}>Đọc tất cả</Text>
          </Pressable>
        </View>
        {operationError ? <Text accessibilityRole="alert" style={s.error}>{operationError}</Text> : null}
        <FlatList data={rows} keyExtractor={item => item.token} refreshing={source.loading && !operationError} onRefresh={refresh}
          contentContainerStyle={s.list} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={source.error ? <ErrorState message={source.error} onRetry={refresh} />
            : source.loading ? <LoadingState layout="list" /> : <EmptyState title={empty} message="" />}
          ListFooterComponent={pages > 1 ? <View style={s.paging}>
            <Pressable accessibilityRole="button" accessibilityLabel="Trang trước" disabled={visiblePage <= 1}
              onPress={() => setPage(visiblePage - 1)} style={s.iconButton}><ChevronLeft size={21} color={visiblePage <= 1 ? C.muted : C.cobalt} /></Pressable>
            <Text style={s.time}>{visiblePage} / {pages}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Trang sau" disabled={visiblePage >= pages}
              onPress={() => setPage(visiblePage + 1)} style={s.iconButton}><ChevronRight size={21} color={visiblePage >= pages ? C.muted : C.cobalt} /></Pressable>
          </View> : undefined}
          renderItem={({ item, index }) => {
            const Icon = icons[item.kind] ?? Bell;
            const group = groupFor(item.at, clock);
            return <>
              {(index === 0 || group !== groupFor(rows[index - 1].at, clock)) &&
                <Text accessibilityRole="header" style={s.group}>{group}</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel={[item.unread ? 'Chưa đọc' : '', item.title, item.summary, formatNoticeTime(item.at), item.actionLabel].filter(Boolean).join('. ')}
                disabled={busy} onPress={() => open(item)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
                <View style={s.category}><Icon size={19} color={C.cobalt} /></View>
                <View style={s.content}>
                  <Text numberOfLines={2} style={[s.rowTitle, item.unread && s.unreadTitle]}>{item.title}</Text>
                  {item.summary ? <Text numberOfLines={2} style={s.preview}>{item.summary}</Text> : null}
                  <View style={s.metadata}>
                    <Text style={s.time}>{formatNoticeTime(item.at)}</Text>
                    {item.actionLabel ? <Text style={s.actionText}>{item.actionLabel}</Text> : null}
                  </View>
                </View>
                {item.unread ? <View style={s.unreadDot} /> : <View style={s.dotSpace} />}
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
  title: { color: C.cobalt, fontSize: 20, fontWeight: '700' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: C.cobalt },
  pressed: { opacity: 0.65 },
  toolbar: { paddingHorizontal: 16, paddingTop: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  filters: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 12, backgroundColor: '#F0F4FB' },
  filterTap: { flex: 1, minHeight: 41, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 3 },
  filterTapActive: { backgroundColor: C.cobalt },
  filterText: { color: C.navy, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  filterTextActive: { color: 'white' },
  readAll: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  actionText: { color: C.cobalt, fontSize: 13, fontWeight: '700' },
  list: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  group: { color: C.muted, fontSize: 13, fontWeight: '700', marginTop: 13, marginBottom: 4 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  category: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EBF2FF', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  content: { flex: 1, minWidth: 0, gap: 4 },
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

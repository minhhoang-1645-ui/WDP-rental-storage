import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { CheckCircle2, CircleAlert } from 'lucide-react-native';
import { router, type Href } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { DateField } from '@/components/date-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors } from '@/constants/wdp-theme';
import { auditAction, auditResource } from '@/utils/audit-labels';
import { isCalendarDate } from '@/utils/calendar-date';
import { label, rows, text, type Row } from './model';
import { Button, Disclosure, Field, Panel, styles } from './ui';
import { useResource } from './use-resource';

const empty = { search: '', outcome: '', role: '', from: '', to: '' };
export function AdminAudit({ category }: { category: 'LOGIN' | 'ACTIVITY' }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState(empty), [filters, setFilters] = useState(empty), [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState('');
  const query = new URLSearchParams({ category, page: String(page), limit: '20' });
  for (const [key, value] of Object.entries(filters)) if (value.trim()) query.set(key, value.trim());
  const data = useResource<Row>(user?.role === 'ADMIN' ? `/admin/audit-events?${query}` : null);
  const total = Number(data.data?.total ?? 0), pages = Math.max(1, Math.ceil(total / 20));
  const update = (key: keyof typeof empty, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  const applyFilters = () => {
    if (draft.from && !isCalendarDate(draft.from) || draft.to && !isCalendarDate(draft.to)) { setFilterError('Nhập ngày hợp lệ theo YYYY-MM-DD.'); return; }
    if (draft.from && draft.to && draft.from > draft.to) { setFilterError('Đến ngày phải bằng hoặc sau Từ ngày.'); return; }
    setFilterError(''); setPage(1); setFilters({ ...draft });
  };
  const when = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
  if (user?.role !== 'ADMIN') return <EmptyState title="Không có quyền truy cập" message="Chỉ Admin được xem nhật ký." />;
  return <FlatList keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} data={rows(data.data?.items)} keyExtractor={item => text(item, 'id')}
    onRefresh={data.refresh} refreshing={data.loading}
    ListHeaderComponent={<View style={{ gap: 14 }}>
      <PageHeader eyebrow="Quản trị" title={category === 'LOGIN' ? 'Lịch sử đăng nhập' : 'Nhật ký hoạt động'} description="Chỉ xem sự kiện được ghi sau khi bật tính năng. Thời gian Việt Nam (UTC+7)." />
      <View style={styles.row}><Button title="Đăng nhập" variant={category === 'LOGIN' ? 'primary' : 'secondary'} onPress={() => router.replace('/admin/login-history' as Href)} /><Button title="Hoạt động" variant={category === 'ACTIVITY' ? 'primary' : 'secondary'} onPress={() => router.replace('/admin/activity')} /></View>
      <Field title="Tìm nhật ký" value={draft.search} onChange={value => update('search', value)} maxLength={100} />
      <Disclosure title="Bộ lọc">
        <Text style={styles.label}>Kết quả</Text><View style={styles.row}>{[['', 'Tất cả'], ['SUCCESS', 'Thành công'], ['FAILURE', 'Thất bại']].map(([value, title]) => <Button key={value} title={title} variant={draft.outcome === value ? 'primary' : 'secondary'} onPress={() => update('outcome', value)} />)}</View>
        <Text style={styles.label}>Vai trò</Text><View style={styles.row}>{['', 'CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].map(value => <Button key={value} title={value ? label(value) : 'Tất cả'} variant={draft.role === value ? 'primary' : 'secondary'} onPress={() => update('role', value)} />)}</View>
        <DateField title="Từ ngày" value={draft.from} onChange={value => update('from', value)} />
        <DateField title="Đến ngày" value={draft.to} onChange={value => update('to', value)} />
      </Disclosure>
      <View style={styles.row}><Button title="Lọc nhật ký" disabled={data.loading} onPress={applyFilters} /><Button title="Xóa bộ lọc" variant="secondary" onPress={() => { setDraft(empty); setFilters(empty); setPage(1); setFilterError(''); }} /></View>
      {filterError ? <Text accessibilityRole="alert" style={styles.error}>{filterError}</Text> : null}
      {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <Text style={styles.copy}>{total} bản ghi</Text>}
    </View>}
    ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Chưa có nhật ký phù hợp" message="Thử đổi bộ lọc. Lịch sử cũ không được tạo lại." /> : null}
    renderItem={({ item }) => <Panel>
      <View style={[styles.row, { alignItems: 'center' }]}>{item.outcome === 'SUCCESS' ? <CheckCircle2 color={WdpColors.success} size={20} /> : <CircleAlert color={WdpColors.danger} size={20} />}<Text style={styles.title}>{auditAction(item.action)}</Text><Text style={[styles.copy, { color: item.outcome === 'SUCCESS' ? WdpColors.success : WdpColors.danger }]}>{item.outcome === 'SUCCESS' ? 'Thành công' : 'Thất bại'}</Text></View>
      <Text style={styles.label}>{text(item, 'actorName') || text(item, 'actorEmail') || 'Không xác định'}</Text>
      {text(item, 'actorName') && text(item, 'actorEmail') ? <Text selectable style={styles.copy}>{text(item, 'actorEmail')}</Text> : null}
      <Text style={styles.copy}>{when(item.createdAt)} · {item.actorRole ? label(item.actorRole) : 'Chưa xác thực'}</Text>
      {category === 'ACTIVITY' && <Text style={styles.copy}>{auditResource(item.resource)}</Text>}
      <Disclosure title="Chi tiết"><Text selectable style={styles.copy}>Mã hồ sơ: {text(item, 'resourceId') || '—'}</Text><Text selectable style={styles.copy}>IP: {text(item, 'ipAddress') || '—'} · HTTP {text(item, 'httpStatus')}</Text><Text selectable style={styles.copy}>{text(item, 'method')} {text(item, 'route')}</Text><Text style={styles.copy}>Mã hành động: {text(item, 'action')}</Text></Disclosure>
    </Panel>}
    ListFooterComponent={data.data ? <View style={{ gap: 12 }}><Text style={styles.copy}>Trang {page}/{pages}</Text><View style={styles.row}><Button title="Trang trước" variant="secondary" disabled={data.loading || page <= 1} onPress={() => setPage(value => value - 1)} /><Button title="Trang sau" variant="secondary" disabled={data.loading || page >= pages} onPress={() => setPage(value => value + 1)} /></View></View> : null}
  />;
}

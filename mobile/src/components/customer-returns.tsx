import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Box, CheckCircle2, ChevronRight, Circle } from 'lucide-react-native';
import { JourneyNotice, JourneyScreen } from '@/components/customer-journey-ui';
import { StatusBadge } from '@/components/customer-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { OperationForm } from '@/operations/form';
import { idOf, rows, text, type Row } from '@/operations/model';
import { useResource } from '@/operations/use-resource';
import { Button, Navigation } from '@/operations/ui';
import { notifyDataChanged } from '@/services/live-events';
import { formatDate, formatMoney } from '@/utils/format';
import { customerRentalActions, returnSettlementAmount } from '@/portals/actions';
import { isCurrentEarlyReturnApproval } from '@/utils/early-return';

const blue = '#0758DC';
const returnPath = (id: string) => '/customer/returns/' + encodeURIComponent(id);
const url = (id: string) => returnPath(id) as Href;
const title = (row: Row) => text(row, 'reservation.storageType.name', 'storageType.name') || 'Kho thuê';

function returnStatus(row: Row) {
  if (text(row, 'physicallyReturnedAt') || ['PENDING_SETTLEMENT', 'COMPLETED'].includes(String(row.status))) return 'Đã bàn giao';
  return ({ REQUESTED: 'Chờ bàn giao', INSPECTION_IN_PROGRESS: 'Đang kiểm tra', ISSUE_FOUND: 'Cần xử lý' } as Record<string, string>)[String(row.status)] || 'Đang xử lý';
}

export function CustomerReturns({ id }: { id?: string }) {
  const { reservationId, approvedEarlyReturn } = useLocalSearchParams<{ reservationId?: string; approvedEarlyReturn?: string }>();
  const creating = id === 'new';
  const detail = id && !creating;
  const rentals = useResource<Row>(detail ? null : '/customer/rentals', true, true);
  const requests = useResource<Row>(detail ? null : '/customer/returns', true, true);
  const proposals = useResource<Row>(creating ? '/customer/support-requests' : null, true, true);
  const record = useResource<Row>(id && detail ? '/customer/returns/' + encodeURIComponent(id) : null);
  const [tab, setTab] = useState<'active' | 'sent'>('active');
  const [selected, setSelected] = useState('');
  const active = rows(rentals.data?.items).filter(row => rows(row.contracts).some(contract => contract.status === 'ACTIVE'));
  const sent = rows(requests.data?.items);
  const rental = active.find(row => text(row, 'reservationId') === selected);
  const pending = sent.find(row => row.status !== 'COMPLETED' && text(row, 'reservation.id') === selected);
  const sources = detail ? [record] : creating ? [rentals, requests, proposals] : [rentals, requests];
  const error = sources.find(source => source.error)?.error;
  const refresh = () => sources.forEach(source => source.refresh());
  if (error) return <JourneyScreen title="Trả kho"><ErrorState message={error} onRetry={refresh} /></JourneyScreen>;
  if (sources.some(source => source.loading)) return <JourneyScreen title="Trả kho"><LoadingState /></JourneyScreen>;
  if (detail && record.data) return <ReturnDetail row={record.data} />;
  return <JourneyScreen title={creating ? 'Yêu cầu trả kho' : 'Trả kho'}
    action={!creating && tab === 'active' && rental ? { title: 'Tiếp tục', onPress: () => pending ? router.push(url(idOf(pending))) : router.push(('/customer/returns/new?reservationId=' + encodeURIComponent(selected)) as Href) } : undefined}>
    {creating ? <ReturnFormContent reservationId={reservationId} fromApproval={approvedEarlyReturn === '1'}
      active={active} sent={sent} proposals={rows(proposals.data?.items)} /> : <>
      <View style={s.options}>
        <Choice title={'Đang thuê (' + active.length + ')'} selected={tab === 'active'} onPress={() => setTab('active')} />
        <Choice title={'Yêu cầu đã gửi (' + sent.length + ')'} selected={tab === 'sent'} onPress={() => setTab('sent')} />
      </View>
      {tab === 'active' ? active.map(row => {
        const key = text(row, 'reservationId');
        return <Choice key={key} title={title(row)} description={'Hết hạn thuê: ' + formatDate(text(row, 'effectiveEndDate'))}
          selected={selected === key} onPress={() => setSelected(key)} />;
      }) : sent.map(row => <Pressable accessibilityRole="button" onPress={() => router.push(url(idOf(row)))} key={idOf(row)} style={s.card}>
        <Box size={20} color={blue} /><View style={s.grow}><Text style={s.title}>{title(row)}</Text>
          <Text style={s.muted}>{formatDate(text(row, 'requestedAt'))}</Text>
          <StatusBadge status={returnStatus(row)} tone={returnStatus(row) === 'Đã bàn giao' ? 'success' : 'warning'} /></View><ChevronRight size={17} color="#475569" />
      </Pressable>)}
      {!(tab === 'active' ? active.length : sent.length) ? <EmptyState title={tab === 'active' ? 'Bạn chưa có kho đang thuê' : 'Chưa có yêu cầu trả kho'} message="" /> : null}
      {tab === 'active' && sent.length > 0 ? <Button variant="secondary" title="Xem các yêu cầu trả kho đã gửi" onPress={() => setTab('sent')} /> : null}
      {tab === 'sent' ? <>
        <Navigation compact title="Theo dõi đề nghị trả trước hạn" path="/customer/early-returns" />
        <Navigation compact title="Xem quyết toán tiền cọc" path="/customer/deposit-settlements" />
      </> : null}
    </>}
  </JourneyScreen>;
}

function Choice({ title, description, selected, onPress }: { title: string; description?: string; selected: boolean; onPress: () => void }) {
  const Icon = selected ? CheckCircle2 : Circle;
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[s.card, s.choice, selected && s.selected]}>
    <View style={s.grow}><Text style={[s.title, selected && { color: blue }]}>{title}</Text>
      {description ? <Text style={s.muted}>{description}</Text> : null}</View><Icon size={18} color={selected ? blue : '#94A3B8'} />
  </Pressable>;
}

function ReturnFormContent({ reservationId, fromApproval, active, sent, proposals }: {
  reservationId?: string; fromApproval: boolean; active: Row[]; sent: Row[]; proposals: Row[];
}) {
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<'normal' | 'early'>('normal');
  const [editing, setEditing] = useState(false);
  const targetId = reservationId || selected;
  const pending = sent.find(row => row.status !== 'COMPLETED' && text(row, 'reservation.id') === targetId);
  const item = active.find(row => text(row, 'reservationId') === targetId);
  const actions = item ? customerRentalActions(item, sent, Date.now(), proposals) : [];
  const normal = actions.find(action => action.path === '/customer/returns');
  const early = actions.find(action => action.title === 'Đề nghị trả trước hạn');
  const action = mode === 'normal' ? normal : early;
  const debt = item ? returnSettlementAmount(item) : NaN;
  const approved = item && proposals.some(row => text(row, 'reservation.id') === targetId &&
    isCurrentEarlyReturnApproval(row, text(item, 'effectiveEndDate')));
  if (pending) return <Navigation title="Xem yêu cầu trả kho đang xử lý" path={returnPath(idOf(pending))} />;
  if (!item && reservationId) return <EmptyState title="Kho này không còn đủ điều kiện trả" message="" />;
  if (!item) return <>{active.map(row => <Choice key={text(row, 'reservationId')} title={title(row)} selected={false}
    onPress={() => setSelected(text(row, 'reservationId'))} />)}
    {!active.length && <EmptyState title="Bạn chưa có kho đang thuê" message="" />}</>;
  return <>
    <View style={[s.card, s.selected]}><Box size={22} color={blue} /><View style={s.grow}><Text style={s.title}>{title(item)}</Text>
      <Text style={s.muted}>Hết hạn thuê: {formatDate(text(item, 'effectiveEndDate'))}</Text>
      <Text style={s.muted}>{rows(item.contracts).map(contract => text(contract, 'unit.unitCode')).filter(Boolean).join(' · ')}</Text>
      {Number(item.quantity) > 1 ? <Text style={s.muted}>Yêu cầu áp dụng cho cả {String(item.quantity)} ô kho của đơn thuê.</Text> : null}</View></View>
    {fromApproval ? <JourneyNotice title={approved ? 'Đề nghị trả trước hạn đã được duyệt' : 'Đề nghị trả trước hạn'}
      message={approved ? 'Bạn có thể gửi yêu cầu trả kho sau khi tất toán toàn bộ công nợ.' : 'Đề nghị này hiện không có phê duyệt áp dụng cho kỳ thuê hiện tại.'} /> : <View style={s.options}>
      <Choice title="Đúng hạn" selected={mode === 'normal'} onPress={() => { setMode('normal'); setEditing(false); }} />
      <Choice title="Trước hạn" selected={mode === 'early'} onPress={() => { setMode('early'); setEditing(false); }} />
    </View>}
    <JourneyNotice title="Trước khi bàn giao" message="Kiểm tra công nợ, lấy hết hàng và chuẩn bị chìa khóa hoặc thẻ để bàn giao cho nhân viên." />
    {Number.isFinite(debt) && debt > 0 ? <Text style={s.muted}>Còn phải thanh toán {formatMoney(debt)}.</Text> : null}
    <Navigation compact title="Xem hóa đơn" path="/customer/invoices" />
    <Navigation compact title="Tiền cọc" path="/customer/deposit-settlements" />
    {editing && action ? <OperationForm action={action} onClose={() => setEditing(false)} onSaved={saved => {
      setEditing(false);
      notifyDataChanged(action.path);
      router.replace(mode === 'normal' ? url(idOf(saved)) : ('/customer/early-returns/' + encodeURIComponent(idOf(saved))) as Href);
    }} /> : action ? <Button title={mode === 'normal' ? 'Gửi yêu cầu trả kho' : 'Gửi đề nghị trả trước hạn'} onPress={() => setEditing(true)} /> :
      <Text style={s.muted}>{mode === 'normal' ? 'Chưa đủ điều kiện gửi yêu cầu. Hãy kiểm tra hạn thuê, công nợ và các yêu cầu đang xử lý.' : 'Kho này chưa thể gửi đề nghị trả trước hạn.'}</Text>}
  </>;
}

function ReturnDetail({ row }: { row: Row }) {
  const returnedAt = text(row, 'physicallyReturnedAt');
  const complete = returnStatus(row) === 'Đã bàn giao';
  const steps = [
    ['Đã gửi yêu cầu', text(row, 'requestedAt')],
    ['Bắt đầu kiểm tra', text(row, 'inspectionStartedAt')],
    ['Đã bàn giao kho', returnedAt],
    ['Hoàn tất xử lý', text(row, 'completedAt')],
  ].filter(([, date]) => date);
  return <JourneyScreen title={complete ? 'Đã bàn giao trả kho' : 'Theo dõi trả kho'}
    action={complete ? { title: 'Về Kho thuê', path: '/customer/rentals' } : undefined}>
    {complete && <JourneyNotice success title="Đã bàn giao kho" message={returnedAt ? formatDate(returnedAt, true) : title(row)} />}
    <View style={s.card}><Box size={22} color={blue} /><View style={s.grow}><Text style={s.title}>{title(row)}</Text>
      <Text style={s.muted}>{rows(row.inspections).map(item => text(item, 'unit.unitCode')).filter(Boolean).join(' · ')}</Text>
      <StatusBadge status={returnStatus(row)} tone={complete ? 'success' : 'warning'} /></View></View>
    {steps.map(([label, date]) => <View key={label} style={s.card}><CheckCircle2 size={18} color={blue} /><View style={s.grow}><Text style={s.title}>{label}</Text><Text style={s.muted}>{formatDate(date, true)}</Text></View></View>)}
    {!complete && <JourneyNotice title="Chuẩn bị trước khi bàn giao" message="Lấy hết hàng, chuẩn bị chìa khóa hoặc thẻ và phối hợp với nhân viên kiểm tra kho." />}
    {text(row, 'note') ? <Text style={s.muted}>{text(row, 'note')}</Text> : null}
    {!complete && <Navigation compact title="Liên hệ hỗ trợ" path="/customer/support-requests" />}
  </JourneyScreen>;
}

const s = StyleSheet.create({
  options: { flexDirection: 'row', gap: 8 },
  choice: { flexGrow: 1, flexBasis: 0 },
  selected: { backgroundColor: '#EAF2FF', borderColor: blue },
  card: { minHeight: 48, padding: 11, borderWidth: 1, borderColor: '#D5DEEB', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  title: { color: '#101828', fontSize: 15, fontWeight: '700' },
  muted: { color: '#475569', fontSize: 13 },
});

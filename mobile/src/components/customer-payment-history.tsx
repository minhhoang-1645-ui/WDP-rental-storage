import { useState } from 'react';
import { Alert, Clipboard, Platform, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { Calendar, Check, ChevronDown, ChevronRight, ChevronUp, Copy, CreditCard, FileText, Headphones, Info, Search } from 'lucide-react-native';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { idOf, rows, text, type Row } from '@/operations/model';
import { useResource } from '@/operations/use-resource';
import { supportPath } from './customer-support';
import { formatDate, formatMoney } from '@/utils/format';
import { invoiceStyles as s } from './customer-invoice-styles';
import { EmptyState, ErrorState, LoadingState } from './screen-state';

const endpoint = '/customer/payments';
const methodNames: Record<string, string> = { VNPAY: 'VNPay', BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt' };
const descriptions: Record<string, string> = {
  INITIAL: 'Thanh toán hóa đơn ban đầu', RECURRING: 'Thanh toán tiền thuê', RENEWAL: 'Thanh toán gia hạn', SETTLEMENT: 'Thanh toán quyết toán',
};
const recordedMonth = new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });

function titleFor(payment: Row, invoice?: Row) {
  return descriptions[text(payment, 'invoice.type') || text(invoice ?? {}, 'type')] || 'Thanh toán hóa đơn';
}

function methodFor(payment: Row, full = false) {
  const method = text(payment, 'method');
  return full && method === 'BANK_TRANSFER' ? 'Chuyển khoản ngân hàng' : methodNames[method] || '';
}

function monthFor(payment: Row) {
  const date = new Date(text(payment, 'receivedAt'));
  return Number.isFinite(date.getTime()) ? 'Tháng ' + recordedMonth.format(date) : 'Chưa có ngày ghi nhận';
}

function Header({ title }: { title: string }) {
  return <Stack.Screen options={{ title, headerTitleAlign: 'center', headerTitleStyle: { color: C.navy, fontSize: 19, fontWeight: '700' } }} />;
}

export function CustomerPaymentHistory() {
  const source = useResource<Row>(endpoint, true);
  const payments = rows(source.data?.items).filter(item => idOf(item));
  const invoices = useResource<Row>(payments.some(item => !text(item, 'invoice.type')) ? '/customer/invoices' : null, true);
  const invoiceById = new Map(rows(invoices.data?.items).map(invoice => [idOf(invoice), invoice]));
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [limit, setLimit] = useState(20);
  const [refreshing, setRefreshing] = useState(false);
  const filters = Object.entries(methodNames).filter(([method]) => payments.some(row => row.method === method));
  const method = filters.some(([key]) => key === selected) ? selected : '';
  const keyword = search.trim().toLocaleLowerCase('vi');
  const matches = payments.filter(row => (!method || row.method === method) &&
    [titleFor(row, invoiceById.get(text(row, 'invoice.id'))), methodFor(row), text(row, 'paymentCode'), text(row, 'reference'),
      text(row, 'invoice.invoiceCode'), text(row, 'invoice.reservation.reference')]
      .some(value => value.toLocaleLowerCase('vi').includes(keyword)));
  const groups = new Map<string, Row[]>();
  for (const row of matches.slice(0, limit)) {
    const month = monthFor(row);
    const group = groups.get(month);
    if (group) group.push(row);
    else groups.set(month, [row]);
  }
  return <>
    <Header title="Lịch sử thanh toán" />
    <SectionList style={s.screen} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" stickySectionHeadersEnabled={false}
      sections={[...groups].map(([title, data]) => ({ title, data }))} keyExtractor={idOf}
      refreshing={refreshing && source.loading} onRefresh={() => { setRefreshing(true); source.refresh(); invoices.refresh(); }}
      ListHeaderComponent={<View style={s.section}>
        <Text accessibilityRole="header" style={s.title}>Các giao dịch đã ghi nhận</Text>
        <View style={[s.card, s.row, s.search]}><Search size={18} color={C.muted} />
          <TextInput accessibilityLabel="Tìm giao dịch hoặc mã tham chiếu" style={[s.body, s.grow]}
            placeholder="Tìm giao dịch hoặc mã tham chiếu…" placeholderTextColor={C.muted} value={search} maxLength={120}
            onChangeText={value => { setSearch(value); setLimit(20); }} />
        </View>
        <View style={s.filters}>{[['', 'Tất cả'], ...filters].map(([key, label]) =>
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: key === method }}
            style={[s.chip, key === method && s.activeChip]} onPress={() => { setSelected(key); setLimit(20); }}>
            <Text style={[s.chipText, key === method && s.white]}>{label}</Text>
          </Pressable>)}</View>
      </View>}
      ListEmptyComponent={source.loading ? <LoadingState layout="list" /> : source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
        : <EmptyState title={search || method ? 'Không tìm thấy giao dịch phù hợp' : 'Chưa có giao dịch'} message="Các khoản thanh toán đã ghi nhận sẽ hiển thị tại đây." />}
      ListFooterComponent={limit < matches.length ? <Pressable accessibilityRole="button" style={s.history} onPress={() => setLimit(value => value + 20)}>
        <Text style={s.link}>Xem thêm giao dịch</Text></Pressable> : undefined}
      renderSectionHeader={({ section }) => <View style={[s.row, local.month]}><Calendar size={16} color={C.muted} />
        <Text accessibilityRole="header" style={s.title}>{section.title}</Text></View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" style={[s.row, local.transaction]}
        onPress={() => router.push(('/customer/payment-history/' + encodeURIComponent(idOf(item))) as Href)}>
        <View style={[s.icon, local.icon]}><CreditCard size={22} color={C.navy} /></View>
        <View style={s.grow}><Text style={s.body} numberOfLines={2}>{titleFor(item, invoiceById.get(text(item, 'invoice.id')))}</Text>
          <Text style={s.title}>{typeof item.amount === 'number' ? formatMoney(item.amount) : '—'}</Text>
          <Text style={s.muted}>{[methodFor(item), text(item, 'receivedAt') && formatDate(text(item, 'receivedAt'), true)].filter(Boolean).join(' · ')}</Text>
        </View>
        <Text style={[s.badge, s.greenBadge]}>Đã ghi nhận</Text><ChevronRight size={16} color={C.muted} />
      </Pressable>}
    />
  </>;
}

function Fact({ title, value, icon: Icon, copy = false }: { title: string; value: string; icon?: typeof CreditCard; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copyValue() {
    try {
      if (Platform.OS === 'web') await navigator.clipboard.writeText(value);
      else Clipboard.setString(value);
      setCopied(true);
    } catch {
      Alert.alert('Chưa sao chép được', 'Bạn có thể nhấn giữ mã để sao chép.');
    }
  }
  if (!value) return null;
  return <View style={[s.row, local.fact]}>
    {Icon ? <Icon size={17} color={C.muted} /> : null}
    <Text style={[s.muted, s.grow]}>{title}</Text>
    <Text selectable style={[s.body, local.value]}>{value}</Text>
    {copy ? <Pressable style={local.copy} accessibilityRole="button" accessibilityLabel={copied ? 'Đã sao chép ' + title : 'Sao chép ' + title} onPress={() => void copyValue()}>
      {copied ? <Check size={18} color={C.success} /> : <Copy size={18} color={C.navy} />}
    </Pressable> : null}
  </View>;
}

export function CustomerPaymentDetail({ id }: { id: string }) {
  const source = useResource<Row>(endpoint + '/' + encodeURIComponent(id));
  const payment = source.data;
  const invoiceId = text(payment ?? {}, 'invoice.id');
  const invoice = useResource<Row>(invoiceId && !text(payment ?? {}, 'invoice.type') ? '/customer/invoices/' + encodeURIComponent(invoiceId) : null);
  const [expanded, setExpanded] = useState(false);

  if (!payment) return <>
    <Header title="Chi tiết giao dịch" />
    <ScrollView style={s.screen} contentContainerStyle={s.page}>
      {source.loading ? <LoadingState layout="detail" /> : source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
        : <EmptyState title="Chưa tìm thấy giao dịch" message="Quay lại danh sách để chọn một giao dịch." />}
    </ScrollView>
  </>;

  const reference = text(payment, 'reference');
  const code = text(payment, 'paymentCode');
  const invoiceCode = text(payment, 'invoice.invoiceCode');
  const reservationId = text(payment, 'invoice.reservation.id');
  const openedAt = text(payment, 'createdAt');
  const receivedAt = text(payment, 'receivedAt');
  const initial = (text(payment, 'invoice.type') || text(invoice.data ?? {}, 'type')) === 'INITIAL';
  const hasReferences = Boolean(code || invoiceCode || openedAt);
  function openSupport() {
    const subject = ['Hỗ trợ giao dịch', code || reference].filter(Boolean).join(' · ');
    router.push((supportPath + '/new?invoiceId=' + encodeURIComponent(invoiceId) + '&subject=' + encodeURIComponent(subject)) as Href);
  }

  return <>
    <Header title="Chi tiết giao dịch" />
    <ScrollView style={s.screen} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={local.hero}>
        <View style={s.row}><View style={local.check}><Check size={16} color={C.onHero} /></View><Text style={local.success}>Đã ghi nhận</Text></View>
        <Text selectable style={local.amount}>{typeof payment.amount === 'number' ? formatMoney(payment.amount) : '—'}</Text>
        <Text style={[s.heading, local.heroTitle]}>{titleFor(payment, invoice.data)}</Text>
      </View>
      <View>
        <Fact title="Phương thức" value={methodFor(payment, true)} icon={CreditCard} />
        <Fact title="Thời gian" value={receivedAt ? formatDate(receivedAt, true) : ''} icon={Calendar} />
        <Fact title="Mã tham chiếu" value={reference} icon={FileText} copy />
      </View>
      {invoiceId ? <View style={local.section}>
        <Text accessibilityRole="header" style={s.title}>Hóa đơn liên quan</Text>
        <Pressable style={[s.card, s.row, local.action]} accessibilityRole="button"
          onPress={() => router.push(('/customer/invoices/' + encodeURIComponent(invoiceId)) as Href)}>
          <FileText size={19} color={C.navy} /><Text style={[s.heading, s.grow]}>{initial ? 'Xem hóa đơn ban đầu' : 'Xem hóa đơn'}</Text><ChevronRight size={18} color={C.muted} />
        </Pressable>
      </View> : null}
      {hasReferences ? <View style={[s.card, local.disclosure]}>
        <Pressable style={[s.row, local.action]} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}>
          <Info size={19} color={C.muted} /><Text style={[s.heading, s.grow]}>Thông tin tham chiếu</Text>
          {expanded ? <ChevronUp size={18} color={C.muted} /> : <ChevronDown size={18} color={C.muted} />}
        </Pressable>
        {expanded ? <View style={local.reference}>
          <Fact title="Mã khoản thu" value={code} copy />
          <Fact title="Mã hóa đơn" value={invoiceCode} copy />
          <Fact title="Ngày tạo" value={openedAt ? formatDate(openedAt, true) : ''} />
          {receivedAt && receivedAt !== openedAt ? <Fact title="Ngày ghi nhận" value={formatDate(receivedAt, true)} /> : null}
        </View> : null}
      </View> : null}
      {invoiceId && reservationId ? <Pressable accessibilityRole="button" style={[s.card, s.row, local.action]} onPress={openSupport}>
        <Headphones size={19} color={C.navy} /><Text style={[s.heading, s.grow]}>Cần hỗ trợ về giao dịch này?</Text><ChevronRight size={18} color={C.muted} />
      </Pressable> : null}
    </ScrollView>
  </>;
}

const local = StyleSheet.create({
  month: { paddingTop: 10, paddingBottom: 3 },
  transaction: { minHeight: 76, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  icon: { width: 43, height: 43, borderRadius: 16 },
  hero: { alignItems: 'center', gap: 6, borderRadius: 13, backgroundColor: '#E7F7ED', paddingVertical: 14, paddingHorizontal: 12 },
  heroTitle: { textAlign: 'center' },
  check: { width: 23, height: 23, borderRadius: 12, backgroundColor: C.success, alignItems: 'center', justifyContent: 'center' },
  success: { color: C.success, fontSize: 13, fontWeight: '700' },
  amount: { fontSize: 30, fontWeight: '800', color: C.text, textAlign: 'center' },
  fact: { minHeight: 44, paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  value: { textAlign: 'right', maxWidth: '61%', flexShrink: 1 },
  copy: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 6 },
  action: { minHeight: 46, paddingVertical: 6, paddingHorizontal: 10 },
  disclosure: { padding: 0, overflow: 'hidden' },
  reference: { backgroundColor: C.soft, paddingHorizontal: 4 },
});

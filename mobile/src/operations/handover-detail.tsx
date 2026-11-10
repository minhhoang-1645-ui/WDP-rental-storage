import { useState } from 'react';
import { CalendarDays, Clock, MapPin, Warehouse } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpRadius, WdpSpacing, WdpType } from '@/constants/wdp-theme';
import { handoverWindowIssue, staffRecordActions } from '@/portals/actions';
import { formatDate } from '@/utils/format';
import { recordActions } from './actions';
import { OperationForm, type FormAction } from './form';
import { codeOf, label, rows, text, type Row } from './model';
import { Button, Navigation, styles } from './ui';

const pageSize = 3;

export function HandoverDetail({ row, loading, error, refresh, userId, now }: {
  row?: Row; loading: boolean; error?: string; refresh: () => void; userId: string; now: number;
}) {
  const [action, setAction] = useState<FormAction>();
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const units = rows(row?.allocatedUnits);
  const totalPages = Math.max(1, Math.ceil(units.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const actions = row ? [...recordActions('appointments', row, 'STAFF'), ...staffRecordActions('appointments', row, userId, now)] : [];
  const waitingForTime = row?.status === 'CONFIRMED' && Date.parse(text(row, 'scheduledAt')) > now;
  const windowIssue = row ? handoverWindowIssue(row, now) : false;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
      <View style={local.toolbar}>
        <View style={local.toolbarItem}><Navigation compact title="Danh sách lịch" path="/staff/appointments" mode="back-to" /></View>
        <Button title="Làm mới" variant="secondary" onPress={refresh} disabled={loading || Boolean(action)} />
      </View>
      {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
      {loading ? <LoadingState layout="detail" /> : error ? <ErrorState message={error} onRetry={refresh} /> : row ? (
        <>
          <View style={local.frame}>
            <View style={local.heading}>
              <CalendarDays size={24} color={WdpColors.navy} />
              <Text accessibilityRole="header" style={local.title}>Thông tin bàn giao</Text>
            </View>
            <Text selectable style={local.code}>{codeOf(row)}</Text>
            <Text style={local.status}>{label(row.status)}</Text>
            <View style={local.line}><Clock size={18} color={WdpColors.navy} /><Text style={local.body}>{formatDate(text(row, 'scheduledAt'), true)} · UTC+7</Text></View>
            <Text style={local.caption}>Khách hàng</Text>
            <Text selectable style={local.body}>{text(row, 'reservation.customer.fullName', 'customer.fullName') || 'Chưa có thông tin'}</Text>
            {text(row, 'reservation.customer.phone', 'customer.phone') ? <Text selectable style={local.body}>{text(row, 'reservation.customer.phone', 'customer.phone')}</Text> : null}
            {row.note ? <Text style={local.body}>{String(row.note)}</Text> : null}
          </View>

          <View style={local.frame}>
            <View style={local.heading}><Warehouse size={22} color={WdpColors.navy} /><Text accessibilityRole="header" style={local.title}>Kho bàn giao ({units.length})</Text></View>
            {units.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((unit, index) => (
              <View key={text(unit, 'unitId', 'contractCode') || String(index)} style={local.unit}>
                <Text selectable style={local.unitTitle}>{text(unit, 'unitCode') || 'Kho được phân bổ'}</Text>
                <View style={local.line}><MapPin size={16} color={WdpColors.muted} /><Text style={local.body}>{[text(unit, 'floor'), text(unit, 'zone')].filter(Boolean).join(' · ') || 'Chưa có vị trí'}</Text></View>
                <Text style={local.body}>{formatDate(text(unit, 'contractStartDate'))} – {formatDate(text(unit, 'contractEndDate'))}</Text>
              </View>
            ))}
            {!units.length && <Text style={local.body}>Chưa có thông tin kho bàn giao.</Text>}
            {totalPages > 1 && <View style={local.pagination}><Button title="Trang trước" variant="secondary" disabled={currentPage === 1} onPress={() => setPage(currentPage - 1)} /><Text style={local.body}>{currentPage} / {totalPages}</Text><Button title="Trang sau" variant="secondary" disabled={currentPage === totalPages} onPress={() => setPage(currentPage + 1)} /></View>}
          </View>

          {action ? <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu bàn giao.'); refresh(); }} /> : (
            <View style={local.frame}>
              <Text accessibilityRole="header" style={local.title}>Xử lý bàn giao</Text>
              {row.usageStatus === 'WAITING_FOR_RENTAL_START' ? <Text style={local.body}>Đã giao chìa khóa và giấy tờ. Kho được kích hoạt khi đến ngày thuê và đủ điều kiện.</Text> : null}
              {waitingForTime ? <Text style={local.body}>Chưa đến giờ hẹn. Xác nhận khi khách đã nhận giấy tờ và chìa khóa.</Text> : null}
              {windowIssue && row.status === 'CONFIRMED' ? <Text style={styles.error}>Hiện tại nằm ngoài thời gian được phép bàn giao.</Text> : null}
              {actions.map(item => <Button key={item.title} title={item.title} onPress={() => { setNotice(''); setAction(item); }} />)}
              {!actions.length && !waitingForTime && !windowIssue && row.usageStatus !== 'WAITING_FOR_RENTAL_START' ? <Text style={local.body}>{row.status === 'COMPLETED' ? 'Đã hoàn tất bàn giao.' : 'Hiện chưa có thao tác cần thực hiện.'}</Text> : null}
            </View>
          )}
          <Navigation title="Hồ sơ & lịch sử" path={`/staff/handover-history/${encodeURIComponent(text(row, 'id'))}`} />
        </>
      ) : <EmptyState title="Không tìm thấy lịch bàn giao" message="Quay lại danh sách để chọn lịch khác." />}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: WdpSpacing.xs },
  toolbarItem: { flex: 1 },
  frame: { gap: WdpSpacing.xs, padding: WdpSpacing.md, borderWidth: 1, borderColor: WdpColors.border, backgroundColor: WdpColors.surface, borderRadius: WdpRadius.md },
  heading: { flexDirection: 'row', alignItems: 'center', gap: WdpSpacing.xs },
  title: { ...WdpType.cardTitle, color: WdpColors.navy, flexShrink: 1 },
  code: { ...WdpType.secondary, fontSize: 14, color: WdpColors.muted },
  caption: { ...WdpType.secondary, fontSize: 14, color: WdpColors.muted, marginTop: WdpSpacing.xs },
  status: { ...WdpType.body, color: WdpColors.navy, fontWeight: '700' },
  body: { ...WdpType.body, color: WdpColors.text, flexShrink: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: WdpSpacing.xs },
  unit: { gap: WdpSpacing.xxs, paddingVertical: WdpSpacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: WdpColors.border },
  unitTitle: { ...WdpType.body, fontSize: 16, fontWeight: '700', color: WdpColors.navy },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: WdpSpacing.xs },
});

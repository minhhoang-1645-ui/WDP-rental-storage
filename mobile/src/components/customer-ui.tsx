import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { WdpColors, WdpRadius, WdpSpacing, WdpType } from '@/constants/wdp-theme';
import { codeOf, label, rows, text, type Row } from '@/operations/model';
import { formatDate, formatMoney } from '@/utils/format';

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const statusTone = (status: string): BadgeTone => {
  if (['ACTIVE', 'PAID', 'COMPLETED', 'VERIFIED', 'AVAILABLE', 'RESOLVED'].includes(status)) return 'success';
  if (['OVERDUE', 'REJECTED', 'EXPIRED', 'CANCELLED', 'VOID', 'ISSUE_FOUND'].includes(status)) return 'danger';
  if (['PENDING', 'OPEN', 'PARTIALLY_PAID', 'PENDING_PAYMENT', 'PENDING_VERIFICATION', 'REQUESTED'].includes(status)) return 'warning';
  return 'neutral';
};

const tones: Record<BadgeTone, { backgroundColor: string; color: string }> = {
  success: { backgroundColor: WdpColors.successBackground, color: WdpColors.success },
  warning: { backgroundColor: WdpColors.warningBackground, color: WdpColors.warning },
  danger: { backgroundColor: WdpColors.dangerBackground, color: WdpColors.danger },
  neutral: { backgroundColor: WdpColors.surfaceSecondary, color: WdpColors.muted },
  info: { backgroundColor: WdpColors.tealSubtle, color: WdpColors.teal },
};

export function StatusBadge({ status, tone }: { status: string; tone?: BadgeTone }) {
  const resolvedTone = tone ?? statusTone(status);
  return <View accessibilityRole="text" style={[styles.badge, tones[resolvedTone]]}><Text style={[styles.badgeText, { color: tones[resolvedTone].color }]}>{label(status)}</Text></View>;
}

export function SectionHeader({ title, action }: { title: string; action?: { label: string; path: string } }) {
  return <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{action && <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={() => router.push(action.path as Href)} hitSlop={8}><Text style={styles.sectionAction}>{action.label}</Text></Pressable>}</View>;
}

export function StorageUnitCard({ rental, onPress }: { rental: Row; onPress?: () => void }) {
  const contracts = rows(rental.contracts);
  const unitLabels = contracts.map(contract => text(contract, 'unit.unitCode', 'storageUnit.unitCode', 'unitCode')).filter(Boolean);
  const status = String(rental.rentalState ?? (rental.isOverdue ? 'OVERDUE' : 'ACTIVE'));
  const content = <>
    <View style={styles.cardHeading}><View style={{ flex: 1, gap: WdpSpacing.xxs }}><Text selectable style={styles.eyebrow}>{text(rental, 'reservationReference', 'reference') || 'Kho của bạn'}</Text><Text style={styles.cardTitle}>{text(rental, 'storageType.name', 'product.name') || 'Kho đang thuê'}</Text></View><StatusBadge status={status} /></View>
    <View style={styles.divider} />
    <View style={styles.facts}><Fact label="Mã kho" value={unitLabels.join(' · ') || 'Đang chờ cấp kho'} /><Fact label="Kết thúc thuê" value={formatDate(text(rental, 'effectiveEndDate', 'endDate'))} /><Fact label="Còn phải trả" value={formatMoney(Number(rental.billingSummary && typeof rental.billingSummary === 'object' ? (rental.billingSummary as Row).totalOutstanding : rental.totalOutstanding) || 0)} /></View>
    {rental.pendingRenewal ? <Text style={styles.notice}>Có yêu cầu gia hạn đang được WDP xử lý.</Text> : null}
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`Mở ${text(rental, 'storageType.name') || 'kho đang thuê'}`} onPress={onPress} style={({ pressed }) => [styles.storageCard, pressed && styles.pressed]}>{content}</Pressable> : <View style={styles.storageCard}>{content}</View>;
}

function Fact({ label: factLabel, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{factLabel}</Text><Text selectable style={styles.factValue}>{value}</Text></View>;
}

const journeySteps = ['Đã gửi yêu cầu', 'WDP xác nhận', 'Thanh toán', 'Bàn giao', 'Đang thuê'];
const journeyIndex: Record<string, number> = { PENDING: 0, CONFIRMED: 1, APPROVED: 1, PENDING_PAYMENT: 2, READY_FOR_HANDOVER: 3, ACTIVE: 4, COMPLETED: 4 };

export function ReservationTimeline({ reservation }: { reservation: Row }) {
  const status = String(reservation.status ?? 'PENDING');
  const current = journeyIndex[status] ?? 0;
  const stopped = ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(status);
  return <View style={styles.timeline} accessibilityLabel={`Tiến trình yêu cầu ${codeOf(reservation)}: ${label(status)}`}>
    <View style={styles.timelineHeading}><Text style={styles.cardTitle}>{codeOf(reservation)}</Text><StatusBadge status={status} /></View>
    {journeySteps.map((step, index) => <View key={step} style={styles.timelineRow}><View style={styles.timelineMarker}><View style={[styles.dot, index <= current && !stopped ? styles.dotActive : styles.dotIdle]} />{index < journeySteps.length - 1 && <View style={[styles.line, index < current && !stopped && styles.lineActive]} />}</View><Text style={[styles.timelineText, index === current && !stopped && styles.timelineTextActive]}>{step}{index === current ? ` · ${stopped ? label(status) : 'Hiện tại'}` : ''}</Text></View>)}
    {stopped && <Text style={styles.notice}>Yêu cầu này đã {label(status).toLocaleLowerCase('vi-VN')}. Hãy mở chi tiết để xem hướng dẫn tiếp theo từ WDP.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: WdpRadius.full, paddingHorizontal: WdpSpacing.xs, paddingVertical: WdpSpacing.xxs },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: WdpSpacing.sm, justifyContent: 'space-between' },
  sectionTitle: { color: WdpColors.navy, ...WdpType.sectionTitle },
  sectionAction: { color: WdpColors.teal, fontSize: 14, fontWeight: '600' },
  storageCard: { gap: WdpSpacing.sm, borderColor: WdpColors.border, borderCurve: 'continuous', borderRadius: WdpRadius.lg, borderWidth: 1, backgroundColor: WdpColors.surface, padding: WdpSpacing.md },
  pressed: { opacity: 0.76 },
  cardHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: WdpSpacing.sm, justifyContent: 'space-between' },
  eyebrow: { color: WdpColors.muted, fontSize: 12, fontWeight: '600' },
  cardTitle: { color: WdpColors.text, ...WdpType.cardTitle },
  divider: { backgroundColor: WdpColors.border, height: StyleSheet.hairlineWidth },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.sm },
  fact: { flexGrow: 1, minWidth: 88, gap: WdpSpacing.xxs },
  factLabel: { color: WdpColors.muted, fontSize: 12, lineHeight: 16 },
  factValue: { color: WdpColors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  notice: { color: WdpColors.warning, fontSize: 13, lineHeight: 20 },
  timeline: { gap: WdpSpacing.xs, borderColor: WdpColors.border, borderCurve: 'continuous', borderRadius: WdpRadius.md, borderWidth: 1, backgroundColor: WdpColors.surface, padding: WdpSpacing.md },
  timelineHeading: { alignItems: 'center', flexDirection: 'row', gap: WdpSpacing.sm, justifyContent: 'space-between', marginBottom: WdpSpacing.xxs },
  timelineRow: { alignItems: 'stretch', flexDirection: 'row', gap: WdpSpacing.sm, minHeight: 28 },
  timelineMarker: { alignItems: 'center', width: 14 },
  dot: { borderRadius: WdpRadius.full, height: 10, marginTop: 4, width: 10 },
  dotIdle: { backgroundColor: WdpColors.disabled },
  dotActive: { backgroundColor: WdpColors.teal },
  line: { backgroundColor: WdpColors.border, flex: 1, marginBottom: -4, marginTop: 2, width: 2 },
  lineActive: { backgroundColor: WdpColors.teal },
  timelineText: { color: WdpColors.muted, flex: 1, fontSize: 14, lineHeight: 20 },
  timelineTextActive: { color: WdpColors.text, fontWeight: '600' },
});

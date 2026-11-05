import { createElement, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronDown, ChevronRight, Eye, EyeOff, Search } from 'lucide-react-native';
import { actionIcon, featureIcon } from '@/utils/ui-icons';
import { shortLabel } from '@/utils/ui-labels';
import { WdpColors, WdpRadius, WdpSpacing, WdpType } from '@/constants/wdp-theme';
import { formatMoney } from '@/utils/format';

export const styles = StyleSheet.create({
  page: { gap: WdpSpacing.md, padding: WdpSpacing.md, paddingBottom: 120 },
  card: { gap: WdpSpacing.sm, padding: WdpSpacing.md, borderRadius: WdpRadius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: WdpColors.border, backgroundColor: WdpColors.surface },
  title: { color: WdpColors.navy, ...WdpType.cardTitle },
  copy: { color: WdpColors.muted, ...WdpType.secondary },
  label: { color: WdpColors.text, fontSize: 12, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: WdpColors.border, borderRadius: WdpRadius.sm, borderCurve: 'continuous', paddingHorizontal: WdpSpacing.sm, paddingVertical: WdpSpacing.sm, color: WdpColors.text, backgroundColor: WdpColors.surface, fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.sm },
  error: { color: WdpColors.danger, fontSize: 14, lineHeight: 21 },
  success: { color: WdpColors.success, fontSize: 14, lineHeight: 21 },
  button: { minHeight: 48, flexDirection: 'row', gap: WdpSpacing.xs, justifyContent: 'center', alignItems: 'center', borderRadius: WdpRadius.sm, borderCurve: 'continuous', paddingVertical: WdpSpacing.sm, paddingHorizontal: WdpSpacing.md, backgroundColor: WdpColors.teal },
  buttonText: { color: 'white', fontSize: 14, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  secondaryButton: { backgroundColor: WdpColors.surface, borderWidth: 1, borderColor: WdpColors.border },
  secondaryButtonText: { color: WdpColors.navy },
  navigation: { flexDirection: 'row', alignItems: 'center', gap: WdpSpacing.sm, minHeight: 68 },
  navigationCopy: { flex: 1, gap: 5 },
  navigationTitle: { color: WdpColors.navy, ...WdpType.cardTitle },
  navigationArrow: { width: 28, height: 28, borderRadius: WdpRadius.full, backgroundColor: WdpColors.tealSubtle, alignItems: 'center' as const, justifyContent: 'center' as const },
  pressed: { opacity: 0.72, backgroundColor: WdpColors.soft },
});
export function Button({ title, onPress, disabled = false, variant = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' }) {
  const Icon = actionIcon(title), busy = /^Đang /i.test(title) && disabled;
  const color = variant === 'secondary' ? WdpColors.navy : WdpColors.surface;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, variant === 'secondary' && styles.secondaryButton, (disabled || pressed) && { opacity: disabled ? 0.5 : 0.8 }]}>
    {busy ? <ActivityIndicator size="small" color={color} /> : Icon ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{createElement(Icon, { size: 18, color })}</View> : null}
    <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>{shortLabel(title.replace(/^✓\s*/, ''))}</Text></Pressable>;
}
export function Navigation({ title, path, description, compact = false }: { title: string; path: string; description?: string; compact?: boolean }) {
  const Icon = featureIcon(path);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(path as Href)} style={({ pressed }) => [compact ? { paddingVertical: 12, paddingHorizontal: 14 } : styles.card, styles.navigation, compact && { minHeight: 56 }, pressed && styles.pressed]}>
    <View accessibilityElementsHidden style={{ padding: 8, backgroundColor: WdpColors.soft, borderRadius: 10 }}>{createElement(Icon, { size: 21, color: WdpColors.navy })}</View>
    <View style={styles.navigationCopy}><Text style={[styles.navigationTitle, compact && { fontSize: 15 }]}>{shortLabel(title)}</Text>{Boolean(description) && <Text style={styles.copy}>{description}</Text>}</View><View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><ChevronRight size={18} color={WdpColors.muted} /></View></Pressable>;
}
export function Panel({ title, children }: { title?: string; children: ReactNode }) { return <View style={styles.card}>{Boolean(title) && <Text accessibilityRole="header" style={styles.title}>{shortLabel(title!)}</Text>}{children}</View>; }
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = featureIcon(title);
  return <View style={styles.card}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, flexDirection: 'row', gap: 10, alignItems: 'center' }}>{createElement(Icon, { size: 20, color: WdpColors.navy })}<Text style={[styles.title, { flex: 1 }]}>{shortLabel(title)}</Text>{expanded ? <ChevronDown size={18} color={WdpColors.muted} /> : <ChevronRight size={18} color={WdpColors.muted} />}</Pressable>{expanded && children}</View>;
}
export function Facts({ values }: { values: [string, unknown][] }) {
  return <View style={{ gap: WdpSpacing.sm }}>{values.map(([name, value]) => <View key={name}><Text style={styles.label}>{name}</Text><Text selectable style={styles.copy}>{value === null || value === undefined || value === '' ? '—' : String(value)}</Text></View>)}</View>;
}
export const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? formatMoney(value) : 'Cần xác nhận báo giá';
export function Field({ title, value, onChange, numeric, secure, multiline, disabled, maxLength, keyboardType, autoComplete, autoCapitalize = 'none' }: { title: string; value: string; onChange: (value: string) => void; numeric?: boolean; secure?: boolean; multiline?: boolean; disabled?: boolean; maxLength?: number; keyboardType?: TextInputProps['keyboardType']; autoComplete?: TextInputProps['autoComplete']; autoCapitalize?: TextInputProps['autoCapitalize'] }) {
  const [visible, setVisible] = useState(false);
  const searching = /^Tìm/i.test(title);
  return <View style={{ gap: WdpSpacing.xs }}><Text style={styles.label}>{shortLabel(title)}</Text><View style={{ position: 'relative' }}>{searching && <View pointerEvents="none" style={{ position: 'absolute', left: 12, top: 14, zIndex: 1 }}><Search size={20} color={WdpColors.muted} /></View>}<TextInput placeholder={searching ? 'Nhập từ khóa…' : undefined} placeholderTextColor={WdpColors.muted} accessibilityLabel={title} value={value} onChangeText={onChange} editable={!disabled} secureTextEntry={secure && !visible} multiline={multiline} keyboardType={numeric ? 'numeric' : keyboardType ?? 'default'} autoComplete={autoComplete} autoCapitalize={autoCapitalize} autoCorrect={false} maxLength={maxLength} style={[styles.input, multiline && { minHeight: 90, textAlignVertical: 'top' }, secure && { paddingRight: 58 }, searching && { paddingLeft: 42 }]} />{secure && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} disabled={disabled} onPress={() => setVisible(current => !current)} style={{ position: 'absolute', right: 4, top: 3, bottom: 3, minWidth: 56, alignItems: 'center', justifyContent: 'center' }}>{visible ? <EyeOff size={20} color={WdpColors.navy} /> : <Eye size={20} color={WdpColors.navy} />}</Pressable>}</View></View>;
}

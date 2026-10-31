import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { WdpColors, WdpRadius, WdpSpacing, WdpType } from '@/constants/wdp-theme';
import { formatMoney } from '@/utils/format';

export const styles = StyleSheet.create({
  page: { gap: WdpSpacing.lg, padding: WdpSpacing.md, paddingBottom: 100 },
  card: { gap: WdpSpacing.sm, padding: WdpSpacing.md, borderRadius: WdpRadius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: WdpColors.border, backgroundColor: WdpColors.surface },
  title: { color: WdpColors.navy, ...WdpType.cardTitle },
  copy: { color: WdpColors.muted, ...WdpType.secondary },
  label: { color: WdpColors.text, fontSize: 12, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: WdpColors.border, borderRadius: WdpRadius.sm, borderCurve: 'continuous', paddingHorizontal: WdpSpacing.sm, paddingVertical: WdpSpacing.sm, color: WdpColors.text, backgroundColor: WdpColors.surface, fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.sm },
  error: { color: WdpColors.danger, fontSize: 14, lineHeight: 21 },
  success: { color: WdpColors.success, fontSize: 14, lineHeight: 21 },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: WdpRadius.sm, borderCurve: 'continuous', paddingVertical: WdpSpacing.sm, paddingHorizontal: WdpSpacing.md, backgroundColor: WdpColors.teal },
  buttonText: { color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  secondaryButton: { backgroundColor: WdpColors.surface, borderWidth: 1, borderColor: WdpColors.border },
  secondaryButtonText: { color: WdpColors.navy },
  navigation: { flexDirection: 'row', alignItems: 'center', gap: WdpSpacing.sm, minHeight: 68 },
  navigationCopy: { flex: 1, gap: 5 },
  navigationTitle: { color: WdpColors.navy, ...WdpType.cardTitle },
  navigationArrow: { width: 28, height: 28, borderRadius: WdpRadius.full, backgroundColor: WdpColors.tealSubtle, alignItems: 'center' as const, justifyContent: 'center' as const },
  pressed: { opacity: 0.72, backgroundColor: WdpColors.soft },
});
export function Button({ title, onPress, disabled = false, variant = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, variant === 'secondary' && styles.secondaryButton, (disabled || pressed) && { opacity: disabled ? 0.5 : 0.8 }]}><Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>{title}</Text></Pressable>;
}
export function Navigation({ title, path, description }: { title: string; path: string; description?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}`} onPress={() => router.push(path as Href)} style={({ pressed }) => [styles.card, styles.navigation, pressed && styles.pressed]}><View style={styles.navigationCopy}><Text style={styles.navigationTitle}>{title}</Text>{Boolean(description) && <Text style={styles.copy}>{description}</Text>}</View><View accessibilityElementsHidden importantForAccessibility="no" style={styles.navigationArrow}><ChevronRight size={16} color={WdpColors.teal} strokeWidth={2.5} /></View></Pressable>;
}
export function Panel({ title, children }: { title?: string; children: ReactNode }) { return <View style={styles.card}>{Boolean(title) && <Text style={styles.title}>{title}</Text>}{children}</View>; }
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.card}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.title}>{expanded ? '−' : '+'} {title}</Text></Pressable>{expanded && children}</View>;
}
export function Facts({ values }: { values: [string, unknown][] }) {
  return <View style={{ gap: WdpSpacing.sm }}>{values.map(([name, value]) => <View key={name}><Text style={styles.label}>{name}</Text><Text selectable style={styles.copy}>{value === null || value === undefined || value === '' ? '—' : String(value)}</Text></View>)}</View>;
}
export const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? formatMoney(value) : 'Cần xác nhận báo giá';
export function Field({ title, value, onChange, numeric, secure, multiline, disabled, maxLength }: { title: string; value: string; onChange: (value: string) => void; numeric?: boolean; secure?: boolean; multiline?: boolean; disabled?: boolean; maxLength?: number }) {
  const [visible, setVisible] = useState(false);
  return <View style={{ gap: WdpSpacing.xs }}><Text style={styles.label}>{title}</Text><View style={{ position: 'relative' }}><TextInput accessibilityLabel={title} value={value} onChangeText={onChange} editable={!disabled} secureTextEntry={secure && !visible} multiline={multiline} keyboardType={numeric ? 'numeric' : 'default'} autoCapitalize="none" autoCorrect={false} maxLength={maxLength} style={[styles.input, multiline && { minHeight: 90, textAlignVertical: 'top' }, secure && { paddingRight: 66 }]} />{secure && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} disabled={disabled} onPress={() => setVisible(current => !current)} style={{ position: 'absolute', right: 4, top: 3, bottom: 3, minWidth: 56, alignItems: 'center', justifyContent: 'center' }}><Text style={styles.label}>{visible ? 'Ẩn' : 'Hiện'}</Text></Pressable>}</View></View>;
}

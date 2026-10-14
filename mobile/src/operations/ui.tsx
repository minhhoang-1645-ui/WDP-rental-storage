import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { formatMoney } from '@/utils/format';

export const styles = StyleSheet.create({
  page: { gap: WdpSpacing.md, padding: WdpSpacing.md, paddingBottom: WdpSpacing.xl },
  card: { gap: WdpSpacing.sm, padding: WdpSpacing.md, borderRadius: 16, borderWidth: 1, borderColor: WdpColors.border, backgroundColor: WdpColors.surface },
  title: { color: WdpColors.navy, fontSize: 19, fontWeight: '900' },
  copy: { color: WdpColors.muted, fontSize: 14, lineHeight: 21 },
  label: { color: WdpColors.text, fontSize: 13, fontWeight: '800' },
  input: { minHeight: 48, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: WdpColors.text, backgroundColor: '#F8FAFC' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.sm },
  error: { color: WdpColors.danger, fontSize: 14, lineHeight: 21 },
  success: { color: WdpColors.success, fontSize: 14, lineHeight: 21 },
  button: { minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 12, paddingHorizontal: WdpSpacing.md, backgroundColor: WdpColors.navy },
  buttonText: { color: 'white', fontSize: 14, fontWeight: '800' },
});
export function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function Navigation({ title, path, description }: { title: string; path: string; description?: string }) {
  return <Pressable accessibilityRole="button" onPress={() => router.push(path as Href)} style={styles.card}><Text style={styles.title}>{title} ›</Text>{Boolean(description) && <Text style={styles.copy}>{description}</Text>}</Pressable>;
}
export function Panel({ title, children }: { title?: string; children: ReactNode }) { return <View style={styles.card}>{Boolean(title) && <Text style={styles.title}>{title}</Text>}{children}</View>; }
export function Facts({ values }: { values: [string, unknown][] }) {
  return <View style={{ gap: WdpSpacing.sm }}>{values.map(([name, value]) => <View key={name}><Text style={styles.label}>{name}</Text><Text selectable style={styles.copy}>{value === null || value === undefined || value === '' ? '—' : String(value)}</Text></View>)}</View>;
}
export const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? formatMoney(value) : 'Cần xác nhận báo giá';
export function Field({ title, value, onChange, numeric, secure, multiline, disabled, maxLength }: { title: string; value: string; onChange: (value: string) => void; numeric?: boolean; secure?: boolean; multiline?: boolean; disabled?: boolean; maxLength?: number }) {
  return <View style={{ gap: WdpSpacing.xs }}><Text style={styles.label}>{title}</Text><TextInput accessibilityLabel={title} value={value} onChangeText={onChange} editable={!disabled} secureTextEntry={secure} multiline={multiline} keyboardType={numeric ? 'numeric' : 'default'} autoCapitalize="none" autoCorrect={false} maxLength={maxLength} style={[styles.input, multiline && { minHeight: 90, textAlignVertical: 'top' }]} /></View>;
}

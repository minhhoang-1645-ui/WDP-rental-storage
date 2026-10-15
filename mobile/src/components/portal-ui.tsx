import { Button, Host, Picker, TextInput } from '@expo/ui';
import type { ComponentProps, ReactNode } from 'react';
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WdpColors as colors, WdpSpacing as space } from '@/constants/wdp-theme';

export const portalStyles = StyleSheet.create({
  content: { flexGrow: 1, gap: space.md, padding: space.md, paddingBottom: 48, backgroundColor: colors.background },
  card: { gap: space.sm, padding: space.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 16, borderCurve: 'continuous' },
  title: { fontSize: 19, fontWeight: '800', color: colors.navy },
  text: { fontSize: 14, lineHeight: 22, color: colors.text },
  muted: { fontSize: 13, lineHeight: 20, color: colors.muted },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
  success: { color: colors.success, fontSize: 14, lineHeight: 22 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  input: { width: '100%', minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: colors.surface },
});

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return <View style={portalStyles.card}>{title ? <Text style={portalStyles.title}>{title}</Text> : null}{children}</View>;
}

export function ActionButton({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Host matchContents seedColor={colors.navy}><Button label={label} disabled={disabled} onPress={onPress} variant={secondary ? 'outlined' : 'filled'} style={{ height: 52, width: '100%' }} /></Host>;
}

export function Field({ label, ...props }: ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={{ gap: 6 }}><Text style={portalStyles.muted}>{label}</Text><Host matchContents seedColor={colors.navy}><TextInput {...props} style={{ ...portalStyles.input, height: props.multiline ? 104 : 52 }} /></Host></View>;
}

export function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <View style={{ gap: 6 }}><Text style={portalStyles.muted}>{label}</Text><Host matchContents seedColor={colors.navy}><Picker selectedValue={value} onValueChange={onChange} enabled={!disabled}>{options.map(option => <Picker.Item key={option.value} label={option.label} value={option.value} />)}</Picker></Host></View>;
}

export function MenuLink({ href, title, description }: { href: Href; title: string; description: string }) {
  return <Link href={href} asChild><Pressable accessibilityRole="link" style={({ pressed }) => [portalStyles.card, { opacity: pressed ? 0.65 : 1 }]}><Text style={portalStyles.title}>{title} ›</Text><Text style={portalStyles.muted}>{description}</Text></Pressable></Link>;
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={{ gap: 4, paddingVertical: 4 }}><Text style={portalStyles.muted}>{label}</Text><Text selectable style={portalStyles.text}>{value}</Text></View>;
}


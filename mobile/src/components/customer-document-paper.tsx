import { Image, StyleSheet, Text, View } from 'react-native';
import { Box } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { text, type Row } from '@/operations/model';
import { formatDate } from '@/utils/format';

export function DocumentPaper({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return <View style={s.paper}>
    <View style={s.brand}><Box size={22} color="#0758DC" /><Text style={s.logo}>NestBox</Text></View>
    <Text accessibilityRole="header" style={s.title}>{title}</Text>
    <Text style={s.meta}>{meta}</Text>
    {children}
  </View>;
}

export function DocumentSignature({ terms }: { terms: Row }) {
  const acceptedAt = text(terms, 'acceptedAt');
  const image = text(terms, 'signatureImage');
  return <>
    <DocumentSection title="Xác nhận của khách thuê" values={[
      ['Chữ ký', acceptedAt ? 'Đã ký' : 'Chưa ký'], ['Người ký', text(terms, 'acceptanceName')],
      ['Thời điểm ký', acceptedAt ? formatDate(acceptedAt, true) : ''],
      ['Xác thực email', text(terms, 'verification.method') === 'EMAIL_OTP'
        ? [text(terms, 'verification.recipient'), formatDate(text(terms, 'verification.verifiedAt'), true)].join(' · ') : ''],
    ]} />
    {acceptedAt && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)
      ? <Image source={{ uri: image }} accessibilityLabel="Chữ ký của khách thuê" resizeMode="contain" style={s.signature} /> : null}
  </>;
}

export function DocumentSection({ title, values }: { title: string; values: [string, string][] }) {
  const visible = values.filter(([, value]) => value);
  if (!visible.length) return null;
  return <View style={s.section}>
    <Text accessibilityRole="header" style={s.heading}>{title}</Text>
    {visible.map(([label, value], index) => <View key={index} style={s.line}>
      <Text style={s.meta}>{label}</Text><Text selectable style={s.body}>{value}</Text>
    </View>)}
  </View>;
}

export const documentStyles = StyleSheet.create({
  paper: { borderWidth: 1, borderColor: '#DCE3ED', borderRadius: 12, padding: 14, gap: 12, backgroundColor: 'white' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { fontSize: 18, fontWeight: '800', color: '#0758DC' },
  title: { color: '#101828', fontWeight: '800', fontSize: 20, textAlign: 'center' },
  meta: { fontSize: 13, color: '#475569' },
  body: { fontSize: 15, lineHeight: 22, color: '#101828' },
  section: { gap: 7 },
  heading: { fontSize: 15, fontWeight: '700', color: '#132D58', padding: 8, backgroundColor: '#EDF3FD', borderRadius: 6 },
  line: { gap: 2, paddingHorizontal: 4 },
  signature: { width: '100%', height: 96 },
});

const s = documentStyles;

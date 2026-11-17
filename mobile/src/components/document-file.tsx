import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ChevronRight, FileText } from 'lucide-react-native';
import { staffStyles } from './staff-ui';
import { Button, Disclosure, styles } from '@/operations/ui';
import { WdpColors } from '@/constants/wdp-theme';
import { openDocument } from '@/services/document-file';
export function DocumentFile({ path, name, title, subtitle }: { path: string; name: string; title?: string; subtitle?: string }) {
  const staff = true;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function open() { if (lock.current) return; lock.current=true; setBusy(true); setError(''); try { await openDocument(path, name); } catch (error) { setError(error instanceof Error ? error.message : 'Không tải được tài liệu.'); } finally { lock.current=false; setBusy(false); } }
  if (staff) return <View><Pressable accessibilityRole="button" accessibilityLabel={`Mở ${title || name}`} accessibilityHint="Có thể lưu hoặc in trong ứng dụng PDF. Bản dự thảo chưa phải bản phát hành chính thức." accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void open()} style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, backgroundColor: pressed ? WdpColors.surfaceSecondary : 'transparent', borderBottomWidth: 0.5, borderBottomColor: WdpColors.border })}><FileText size={22} color={WdpColors.navy} /><View style={{ flex: 1, gap: 2 }}><Text style={staffStyles.body}>{title || name+'.pdf'}</Text><Text style={staffStyles.secondary}>{busy ? 'Đang mở tài liệu…' : subtitle || 'PDF · Xem, lưu hoặc chia sẻ'}</Text></View>{busy ? <ActivityIndicator color={WdpColors.navy} /> : <ChevronRight size={18} color={WdpColors.muted} />}</Pressable>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
  return <View style={{ gap: 10, padding: 12, backgroundColor: WdpColors.soft, borderRadius: 12 }}><Text selectable style={styles.label}>{name}.pdf</Text><Button title={busy ? 'Đang tải PDF…' : 'Mở PDF'} disabled={busy} onPress={() => void open()} /><Disclosure title="Về tài liệu"><Text style={styles.copy}>Có thể lưu hoặc in từ ứng dụng PDF. Bản “Dự thảo” chưa được phát hành chính thức.</Text></Disclosure>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}

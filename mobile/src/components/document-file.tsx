import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Disclosure, styles } from '@/operations/ui';
import { WdpColors } from '@/constants/wdp-theme';
import { openDocument } from '@/services/document-file';
export function DocumentFile({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function open() { if (busy) return; setBusy(true); setError(''); try { await openDocument(path, name); } catch (error) { setError(error instanceof Error ? error.message : 'Không tải được tài liệu.'); } finally { setBusy(false); } }
  return <View style={{ gap: 10, padding: 12, backgroundColor: WdpColors.soft, borderRadius: 12 }}><Text selectable style={styles.label}>{name}.pdf</Text><Button title={busy ? 'Đang tải PDF…' : 'Mở PDF'} disabled={busy} onPress={() => void open()} /><Disclosure title="Về tài liệu"><Text style={styles.copy}>Có thể lưu hoặc in từ ứng dụng PDF. Bản “Dự thảo” chưa được phát hành chính thức.</Text></Disclosure>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}

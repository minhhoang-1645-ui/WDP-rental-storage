import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, styles } from '@/operations/ui';
import { openDocument } from '@/services/document-file';
export function DocumentFile({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function open() { if (busy) return; setBusy(true); setError(''); try { await openDocument(path, name); } catch (error) { setError(error instanceof Error ? error.message : 'Không tải được tài liệu.'); } finally { setBusy(false); } }
  return <View style={{ gap: 10, padding: 16, backgroundColor: '#f0f5f7', borderRadius: 12 }}><Text style={styles.label}>{name}.pdf</Text><Text style={styles.copy}>Xem file và chọn mở, lưu hoặc in bằng ứng dụng PDF. Bản có nhãn “Dự thảo” chưa được phát hành chính thức.</Text><Button title={busy ? 'Đang tải PDF…' : 'Mở / lưu / in PDF'} disabled={busy} onPress={() => void open()} />{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}

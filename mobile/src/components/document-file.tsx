import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { ChevronRight, FileText } from 'lucide-react-native';
import { staffStyles } from './staff-ui';
import { Button, styles } from '@/operations/ui';
import { WdpColors } from '@/constants/wdp-theme';
import { discardPdf, downloadPdf, openDocument } from '@/services/document-file';
export function DocumentFile({ path, name, title, subtitle, onOpened }: { path: string; name: string; title?: string; subtitle?: string; onOpened?: () => void }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [pdf, setPdf] = useState<Awaited<ReturnType<typeof downloadPdf>> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    return () => { if (pdf) discardPdf(pdf); };
  }, [pdf]);

  async function open() {
    if (lock.current || pdf) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (Platform.OS === 'ios') {
        const file = await downloadPdf(path, name);
        if (mounted.current) setPdf(file);
        else discardPdf(file);
      } else {
        await openDocument(path, name);
        if (mounted.current) onOpened?.();
      }
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : 'Không tải được tài liệu.');
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const viewer = pdf ? (
    <Modal animationType="slide" onRequestClose={() => setPdf(null)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: WdpColors.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
          <Text style={[staffStyles.body, { flex: 1 }]}>Tài liệu PDF</Text>
          <Button title="Đóng" variant="secondary" onPress={() => setPdf(null)} />
        </View>
        <WebView
          source={{ uri: pdf.uri }}
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={({ url }) => url === pdf.uri}
          javaScriptEnabled={false}
          startInLoadingState
          onLoad={() => onOpened?.()}
          onError={() => {
            setPdf(null);
            setError('Chưa hiển thị được tài liệu PDF. Vui lòng thử lại.');
          }}
        />
      </SafeAreaView>
    </Modal>
  ) : null;
  return <View>{viewer}<Pressable accessibilityRole="button" accessibilityLabel={`Mở ${title || name}`} accessibilityHint="Mở nội dung tài liệu PDF" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void open()} style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, backgroundColor: pressed ? WdpColors.surfaceSecondary : 'transparent', borderBottomWidth: 0.5, borderBottomColor: WdpColors.border })}><FileText size={22} color={WdpColors.navy} /><View style={{ flex: 1, gap: 2 }}><Text style={staffStyles.body}>{title || name+'.pdf'}</Text><Text style={staffStyles.secondary}>{busy ? 'Đang mở tài liệu…' : (Platform.OS === 'ios' ? 'Đọc tài liệu trong ứng dụng' : subtitle || 'PDF · Xem, lưu hoặc chia sẻ')}</Text></View>{busy ? <ActivityIndicator color={WdpColors.navy} /> : <ChevronRight size={18} color={WdpColors.muted} />}</Pressable>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}

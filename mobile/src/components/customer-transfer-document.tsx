import { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/operations/ui';
import { rows, text, type Row } from '@/operations/model';
import { DocumentPaper, DocumentSection, DocumentSignature, documentStyles } from './customer-document-paper';
import { customerStyles } from './customer-premium';

export function CustomerTransferDocument({ content, terms, onReviewed }: { content: Row; terms: Row; onReviewed: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const hash = text(terms, 'snapshotHash');
  return <>
    <Button title="Xem nội dung phụ lục" variant="secondary" onPress={() => setOpen(true)} />
    <Modal visible={open} onRequestClose={close} presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Button title="Quay lại" variant="secondary" onPress={close} />
          <Text accessibilityRole="header" style={customerStyles.section}>Phụ lục chuyển kho</Text>
        </View>
        <ScrollView contentContainerStyle={customerStyles.page}>
          <DocumentPaper title="Phụ lục đổi loại kho" meta={[text(content, 'code'), text(content, 'version')].filter(Boolean).join(' · ')}>
            {content.issuerDraft === true && <Text style={documentStyles.meta}>Bản dự thảo</Text>}
            {rows(content.sections).map(section => {
              const title = text(section, 'title');
              const values = Array.isArray(section.rows) ? section.rows as [string, string][] : [];
              return <View key={title} style={documentStyles.section}>
                {values.length ? <DocumentSection title={title} values={values} /> : <Text accessibilityRole="header" style={documentStyles.heading}>{title}</Text>}
                {Array.isArray(section.paragraphs) && section.paragraphs.map((paragraph: string) => <Text key={paragraph} selectable style={documentStyles.body}>{paragraph}</Text>)}
              </View>;
            })}
            <DocumentSignature terms={terms} />
            <Text selectable style={documentStyles.meta}>Mã đối chiếu SHA-256: {hash}</Text>
          </DocumentPaper>
          {!terms.acceptedAt && <Button title="Đã đọc, quay lại ký" onPress={() => { onReviewed(); close(); }} />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}

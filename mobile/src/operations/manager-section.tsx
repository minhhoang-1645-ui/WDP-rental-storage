import { ScrollView } from 'react-native';
import { PageHeader } from '@/components/page-header';
import { WorkHub } from '@/components/workspace-hub';
import { styles } from './ui';
import { managerSections, type ManagerSection } from '@/utils/manager-sections';
export function ManagerSectionScreen({ section }: { section: ManagerSection }) {
  const config = managerSections[section];
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Quản lý cơ sở" title={config.title} description={config.description} /><WorkHub title="Chọn việc cần xử lý" description="Các bước vận hành thường ngày thuộc nhân viên." actions={config.items.map(item => ({title:item.title,description:item.description,path:item.mobile}))} /></ScrollView>;
}

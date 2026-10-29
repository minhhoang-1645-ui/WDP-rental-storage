import { ClipboardCheck } from 'lucide-react';
import { PageHeader } from '../../components/manager/PortalUi';
import { WorkHub } from '../../components/workspace/WorkHub';
import { managerSections, type ManagerSection } from '../../utils/manager-sections';
export function ManagerSectionPage({ section }: { section: ManagerSection }) {
  const config = managerSections[section];
  return <section><PageHeader title={config.title} description={config.description} /><WorkHub title="Chọn việc cần xử lý" description="Mỗi mục giữ đúng trách nhiệm và quyền của quản lý." actions={config.items.map(item => ({title:item.title,description:item.description,to:item.web,icon:ClipboardCheck}))} /></section>;
}

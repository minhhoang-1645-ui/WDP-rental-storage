import { ClipboardCheck } from 'lucide-react';
import { PageHeader } from '../../components/manager/PortalUi';
import { WorkHub } from '../../components/workspace/WorkHub';
import { managerSections, type ManagerSection } from '../../utils/manager-sections';
export function ManagerSectionPage({ section }: { section: ManagerSection }) {
  const config = managerSections[section];
  return <section><PageHeader title={config.title}  /><WorkHub title="Chọn việc cần xử lý" description="" actions={config.items.map(item => ({title:item.title,description:"",to:item.web,icon:ClipboardCheck}))} /></section>;
}

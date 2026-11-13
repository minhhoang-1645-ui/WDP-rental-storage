import { ClipboardCheck } from 'lucide-react';
import { PageHeader } from '../../components/manager/PortalUi';
import { WorkHub, type WorkAction } from '../../components/workspace/WorkHub';
import { managerSections, type ManagerSection } from '../../utils/manager-sections';
export function ManagerSectionPage({ section }: { section: ManagerSection }) {
  const config = managerSections[section];
  const actions: WorkAction[] = config.items.map(item => ({ title: item.title, description: item.description, to: item.web, icon: ClipboardCheck }));
  if (section === 'reviews') actions.push({ title: 'Quyết toán cọc chờ duyệt', description: 'Đối chiếu hiện trạng, khấu trừ và số tiền hoàn.', to: '/manager/operations/deposit-settlements?status=PENDING_REVIEW', icon: ClipboardCheck });
  return <section><PageHeader title={config.title} /><WorkHub title="Danh sách nghiệp vụ" description="" actions={actions} /></section>;
}

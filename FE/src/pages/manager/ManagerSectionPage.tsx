import { ClipboardCheck } from 'lucide-react';
import { PageHeader } from '../../components/manager/PortalUi';
import { WorkHub, type WorkAction } from '../../components/workspace/WorkHub';
import { managerSections, type ManagerSection } from '../../utils/manager-sections';
import { ManagerReviewInbox } from './ManagerReviewInbox';
export function ManagerSectionPage({ section }: { section: ManagerSection }) {
  if (section === 'reviews') return <ManagerReviewInbox />;
  const config = managerSections[section];
  const actions: WorkAction[] = config.items.map(item => ({ title: item.title, description: item.description, to: item.web, icon: ClipboardCheck }));
  if (section === 'finance') actions.push({ title: 'Thanh toán và đối soát', description: 'Xác minh chuyển khoản và xử lý giao dịch cần đối soát.', to: '/manager/payment-submissions', icon: ClipboardCheck });
  return <section><PageHeader title={config.title} /><WorkHub title="Chọn công việc" description="" actions={actions} /></section>;
}

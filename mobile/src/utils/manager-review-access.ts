import { canOperateResource } from './operation-access';

export const isManagerReviewWorkflow = (resource: string) => ['support-requests', 'maintenance'].includes(resource);
export const managerReviewStatus = (resource: string) => resource === 'support-requests' ? 'ESCALATED' : resource === 'maintenance' ? 'AWAITING_VERIFICATION' : '';
export const managerReviewTitle = (resource: string) => resource === 'support-requests' ? 'Hỗ trợ cần quyết định' : 'Nghiệm thu bảo trì';

export const canAccessManagerReview = (role: string, resource: string) =>
  canOperateResource(role, resource) || (role === 'MANAGER' && isManagerReviewWorkflow(resource));

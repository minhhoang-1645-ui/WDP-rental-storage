import { canOperateResource } from './operation-access';

export const isManagerReviewWorkflow = (resource: string) => ['support-requests', 'maintenance'].includes(resource);

export const canAccessManagerReview = (role: string, resource: string) =>
  canOperateResource(role, resource) || (role === 'MANAGER' && isManagerReviewWorkflow(resource));

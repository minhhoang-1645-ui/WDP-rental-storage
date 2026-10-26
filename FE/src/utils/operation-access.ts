export const staffWorkflows = ['reservations', 'inquiries', 'support-requests', 'appointments', 'stock-movements', 'renewals', 'transfers', 'returns', 'maintenance'] as const;
export const staffLookups = ['units', 'contracts'] as const;
export const isStaffWorkflow = (resource: string) => (staffWorkflows as readonly string[]).includes(resource);
export const canOperateResource = (role: string, resource: string) => role === 'STAFF'
  ? isStaffWorkflow(resource)
  : role === 'MANAGER' && !isStaffWorkflow(resource);

/** Shared screens keep their resource names; requests use the authenticated role's API namespace. */
export function operationApiPath(path: string, role: string | undefined, method = 'GET') {
  if (role !== 'STAFF') return path;
  const match = /^\/manager\/([^/?]+)(?=[/?]|$)/.exec(path);
  if (match && (isStaffWorkflow(match[1]) || (method === 'GET' && (staffLookups as readonly string[]).includes(match[1])))) return path.replace('/manager/', '/staff/management/');
  const staff = /^\/staff\/([^/?]+)(?=[/?]|$)/.exec(path);
  if (method === 'GET' && staff && isStaffWorkflow(staff[1])) return path.replace('/staff/', '/staff/management/');
  return path;
}

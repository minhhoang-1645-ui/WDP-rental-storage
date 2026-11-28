// API/URL namespaces are stable; role codes are not URL segments.
export const roleNamespaces: Record<string, string> = { STORAGE_CUSTOMER: 'customer', FACILITY_STAFF: 'staff', FACILITY_MANAGER: 'manager', BUSINESS_OPERATIONS_MANAGER: 'operations', SYSTEM_ADMINISTRATOR: 'admin' };
export const roleNamespace = (role: string): string => roleNamespaces[role] ?? 'forbidden';
export const userRoles = ['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'] as const;
export type UserRole = typeof userRoles[number];

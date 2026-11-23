export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'STORAGE_CUSTOMER' | 'FACILITY_STAFF' | 'FACILITY_MANAGER' | 'BUSINESS_OPERATIONS_MANAGER' | 'SYSTEM_ADMINISTRATOR';
}

export interface AuthSession {
  token: string;
  user: PublicUser;
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  user?: PublicUser;
}

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'CUSTOMER' | 'STAFF' | 'MANAGER' | 'ADMIN';
}

export interface AuthSession {
  token: string;
  user: PublicUser;
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  user?: PublicUser;
}

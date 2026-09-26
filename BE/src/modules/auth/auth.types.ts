export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'CUSTOMER';
}

export interface AuthSession {
  token: string;
  user: PublicUser;
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  user?: PublicUser;
}

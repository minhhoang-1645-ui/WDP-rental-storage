import { BriefcaseBusiness, ClipboardCheck, ShieldCheck, UserRound } from 'lucide-react';

const adminRoles = {
  CUSTOMER: { label: 'Khách hàng', icon: UserRound },
  STAFF: { label: 'Nhân viên', icon: ClipboardCheck },
  MANAGER: { label: 'Quản lý', icon: BriefcaseBusiness },
  ADMIN: { label: 'Quản trị viên', icon: ShieldCheck },
};

export function AccountRole({ value }: { value: unknown }) {
  if (typeof value !== 'string' || !Object.hasOwn(adminRoles, value)) return <span>—</span>;
  const { label, icon: Icon } = adminRoles[value as keyof typeof adminRoles];
  return <span className="admin-role"><Icon size={16} aria-hidden="true" />{label}</span>;
}

export function AdminAvatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(-2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('vi');
  return <span aria-hidden="true" className={large ? 'admin-avatar admin-avatar-large' : 'admin-avatar'}>{initials || '—'}</span>;
}

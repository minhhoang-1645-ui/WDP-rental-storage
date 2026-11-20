import { first, type Row } from '../components/manager/portal-data';

export function isFixtureStaff(person: { id?: unknown; email?: unknown }) {
  const id = typeof person.id === 'string' ? person.id : '';
  const email = typeof person.email === 'string' ? person.email : '';
  return /^(?:(?:appointment|billing|settlement|return|renewal|maintenance|manager|support)-staff-[0-9a-f]{8}|DEMO-[0-9a-f]{7,8}-staff)@(?:example|x)\.test$/i.test(email)
    || /^(?:appointment|billing|settlement|return|renewal|maintenance|manager|support)-(?:other-)?staff-[0-9a-f]{8}$/i.test(id);
}

// Stock movements identify assignees by relationship and omit their role.
// Reporters still need an explicit STAFF role before appearing as choices.
export function staffFromWork(items: Row[]) {
  const staff = new Map<string, string>();
  for (const row of items) for (const field of ['assignedStaff', 'reportedBy']) {
    const person = row[field] as Row | undefined;
    if (!person || isFixtureStaff(person) || person.accountStatus === 'DISABLED' || (field === 'reportedBy' && person.role !== 'STAFF') || (person.role && person.role !== 'STAFF')) continue;
    const id = first(person, 'id');
    if (id) staff.set(id, first(person, 'fullName') || id);
  }
  return staff;
}

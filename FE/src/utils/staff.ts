import { first, type Row } from '../components/manager/portal-data';

// Stock movements identify assignees by relationship and omit their role.
// Reporters still need an explicit STAFF role before appearing as choices.
export function staffFromWork(items: Row[]) {
  const staff = new Map<string, string>();
  for (const row of items) for (const field of ['assignedStaff', 'reportedBy']) {
    const person = row[field] as Row | undefined;
    if (!person || person.accountStatus === 'DISABLED' || (field === 'reportedBy' && person.role !== 'STAFF') || (person.role && person.role !== 'STAFF')) continue;
    const id = first(person, 'id');
    if (id) staff.set(id, first(person, 'fullName') || id);
  }
  return staff;
}

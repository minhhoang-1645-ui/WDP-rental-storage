export function isFixtureStaff(person: { id?: unknown; email?: unknown }) {
  const id = typeof person.id === 'string' ? person.id : '', email = typeof person.email === 'string' ? person.email : '';
  return /^(?:(?:appointment|billing|settlement|return|renewal|maintenance|manager|support)-staff-[0-9a-f]{8}|DEMO-[0-9a-f]{7,8}-staff)@(?:example|x)\.test$/i.test(email) || /^(?:appointment|billing|settlement|return|renewal|maintenance|manager|support)-(?:other-)?staff-[0-9a-f]{8}$/i.test(id);
}

export function isFixtureUnit(row: Record<string, unknown>) {
  const type = row.storageType && typeof row.storageType === 'object' ? row.storageType as Record<string, unknown> : {};
  return /^(?:appointment|billing|settlement|return|renew|test|manager|overdue|maintenance)-product-[0-9a-f]{8}$/i.test(String(type.id ?? '')) || /^DEMO-(?:SM|MD|LG|LK)-/i.test(String(row.unitCode ?? row.unitNumber ?? ''));
}

const configured = {
  name: import.meta.env.VITE_FACILITY_NAME?.trim(),
  address: import.meta.env.VITE_FACILITY_ADDRESS?.trim(),
  phone: import.meta.env.VITE_FACILITY_PHONE?.trim(),
  email: import.meta.env.VITE_FACILITY_EMAIL?.trim(),
  hours: import.meta.env.VITE_FACILITY_HOURS?.trim(),
}
export const facility = {
  name: configured.name || 'WDP Storage · Cơ sở TP. Hồ Chí Minh',
  address: configured.address || 'Lô WDP-01, khu kho vận WDP, TP. Hồ Chí Minh',
  phone: configured.phone || '0000 000 000',
  email: configured.email || 'hotro@wdp-storage.example',
  hours: configured.hours || '08:00–18:00 · Thứ Hai đến Chủ Nhật',
  illustrative: !Object.values(configured).every(Boolean),
  phoneHref: configured.phone && /^\+?[\d\s().-]{8,25}$/.test(configured.phone) && /[1-9]/.test(configured.phone) ? `tel:${configured.phone.replace(/[^\d+]/g, '')}` : undefined,
  emailHref: configured.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured.email) && !configured.email.endsWith('.example') ? `mailto:${configured.email}` : undefined,
}

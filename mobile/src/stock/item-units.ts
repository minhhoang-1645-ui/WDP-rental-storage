export const itemUnits = ['cái', 'thùng', 'kiện', 'bộ', 'túi', 'hộp', 'cuộn', 'bao', 'đôi', 'tấm', 'pallet'] as const;
export const isItemUnit = (value: string) => (itemUnits as readonly string[]).includes(value);

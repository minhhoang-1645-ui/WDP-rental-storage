import { idOf, rows, text, type Row } from '@/operations/model';

type Unit = { id: string; code: string; row: number; position: number };
export type PlanCell = { id: string; code: string; x: number; y: number; side: number };

export function storageFloorPlan(source: unknown) {
  const units: Unit[] = [];
  for (const item of rows(source)) {
    const id = idOf(item);
    const code = text(item, 'code').trim();
    if (id && code && typeof item.row === 'number' && Number.isSafeInteger(item.row) &&
      typeof item.position === 'number' && Number.isSafeInteger(item.position)) {
      units.push({ id, code, row: item.row, position: item.position });
    }
  }
  if (!units.length) return null;
  units.sort((a, b) => a.row - b.row || a.position - b.position || a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
  const banks: Unit[][] = [];
  for (const unit of units) {
    const bank = banks.at(-1);
    if (!bank || bank[0].row !== unit.row || bank.length === 5) banks.push([unit]);
    else bank.push(unit);
  }
  const cells: PlanCell[] = banks.flatMap((bank, index) => bank.map((unit, slot) => ({
    id: unit.id, code: unit.code, x: index % 2 === 0 ? 16 : 206,
    y: 24 + Math.floor(index / 2) * 224 + slot * 38, side: index % 2,
  })));
  return { cells, width: 336, height: Math.floor((banks.length - 1) / 2) * 224 + Math.max(3, ...banks.slice(-((banks.length - 1) % 2 + 1)).map(bank => bank.length)) * 38 + 62 };
}

export function rentalFloorPlan(rental: Row, unitId: string) {
  if (!unitId) return null;
  const layout = rows(rental.unitLayouts).find(item => text(item, 'unitId') === unitId);
  const plan = storageFloorPlan(layout?.units);
  return plan?.cells.some(cell => cell.id === unitId) ? plan : null;
}

export type RentalFloorPlan = NonNullable<ReturnType<typeof storageFloorPlan>>;

import { itemUnits } from '../utils/item-units';

export function ItemUnitSelect({ value, onChange, required }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  return <select required={required} value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Chọn đơn vị</option>
    {itemUnits.map(unit => <option key={unit} value={unit}>{unit[0].toLocaleUpperCase('vi') + unit.slice(1)}</option>)}
  </select>;
}

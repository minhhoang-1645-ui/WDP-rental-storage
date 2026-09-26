import { Archive, Armchair, Bike, Box, LampFloor, Package, Refrigerator, Sofa } from 'lucide-react'
import type { StorageSize } from '../../types/storage'

export function StorageSizeVisual({ size }: { size: StorageSize }) {
  return <div className="size-visual" aria-label={`Minh họa sức chứa của ${size.name}`} role="img">
    <div className="size-visual-grid" />
    <div className="size-room" style={{ width: `${size.illustrationScale}%` }}>
      <div className="size-items">
        <Package /><Box />
        {size.illustrationScale >= 40 && <Bike />}
        {size.illustrationScale >= 55 && <><Armchair /><LampFloor /></>}
        {size.illustrationScale >= 70 && <><Sofa /><Refrigerator /></>}
        {size.illustrationScale >= 85 && <Archive />}
      </div>
      <span>{size.floorArea}</span>
    </div>
    <div className="size-ruler"><i />{size.dimensions}<i /></div>
  </div>
}

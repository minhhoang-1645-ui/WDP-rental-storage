import { bookingVisuals } from '../../data/booking'
import type { StorageSizeId } from '../../types/storage'

export function StorageIllustration({ sizeId, className = '' }: { sizeId: StorageSizeId; className?: string }) {
  const visual = bookingVisuals[sizeId]
  return <div
    className={`booking-illustration ${className}`}
    role="img"
    aria-label={visual.alt}
    style={{ backgroundImage: "url('/images/booking/storage-size-atlas.jpg')", backgroundPosition: visual.position }}
  />
}


export type StorageCondition = 'standard' | 'climate'
export type StorageSizeId = 'locker' | 'small' | 'medium' | 'large'

export interface StorageSize {
  id: StorageSizeId
  name: string
  kicker: string
  dimensions: string
  floorArea: string
  volume: string
  roomEquivalent: string
  capacity: string
  boxCount: string
  suitableItems: string[]
  image: string
  illustrationScale: number
}

export interface StorageListing {
  id: string
  code: string
  name: string
  sizeId: StorageSizeId
  condition: StorageCondition
  status: 'available' | 'limited'
  floor: string
  access: string
  monthlyPrice: number
  depositMonths: number | null
  minRentalDays: number | null
  allowDailyRental: boolean
  features: string[]
  image: string
}

export interface SearchCriteria {
  size: StorageSizeId | 'all'
  type: StorageCondition | 'all'
  date: string
  duration: string
}

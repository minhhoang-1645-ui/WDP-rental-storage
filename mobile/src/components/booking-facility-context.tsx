import { createContext, useContext, useState, type ReactNode } from 'react';

const BookingFacility = createContext<{
  facilityId: string;
  selectFacility: (id: string) => void;
}>({ facilityId: '', selectFacility: () => undefined });

export function BookingFacilityProvider({ children }: { children: ReactNode }) {
  const [facilityId, selectFacility] = useState('');
  return <BookingFacility.Provider value={{ facilityId, selectFacility }}>
    {children}
  </BookingFacility.Provider>;
}

export function useBookingFacility() {
  return useContext(BookingFacility);
}

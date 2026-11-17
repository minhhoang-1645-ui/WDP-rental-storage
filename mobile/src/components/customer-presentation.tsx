import { createContext, useContext } from 'react';

/** Scoped by the Customer layout; other role presentations remain unchanged. */
export const CustomerPresentation = createContext(false);
export const useCustomerPresentation = () => useContext(CustomerPresentation);

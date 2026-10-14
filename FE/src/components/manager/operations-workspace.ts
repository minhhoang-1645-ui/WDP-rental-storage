import { createContext } from 'react';

// Shared operation pages inherit their URL namespace from the enclosing layout.
export const OperationsWorkspace = createContext<'/manager' | '/admin/facility' | null>(null);

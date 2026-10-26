import { createContext } from 'react';

// Shared operation pages inherit their URL namespace from the enclosing layout.
export const OperationsWorkspace = createContext<'/manager' | '/staff' | '/admin/facility' | null>(null);

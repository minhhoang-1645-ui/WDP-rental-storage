export interface SignaturePadHandle { capture: () => Promise<string>; clear: () => void }
export interface SignaturePadProps { compact?: boolean; onValidityChange?: (valid: boolean) => void }

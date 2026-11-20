import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export function DetailDisclosure({ title, children, open, onToggle }: { title: string; children: ReactNode; open?: boolean; onToggle?: (open: boolean) => void }) {
  return <details className="record-disclosure" open={open} onToggle={event => onToggle?.(event.currentTarget.open)}>
    <summary>{title}<ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="record-disclosure-content">{children}</div>
  </details>;
}

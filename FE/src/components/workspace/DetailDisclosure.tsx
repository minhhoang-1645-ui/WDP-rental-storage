import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export function DetailDisclosure({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="record-disclosure" open={open}>
    <summary>{title}<ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="record-disclosure-content">{children}</div>
  </details>;
}

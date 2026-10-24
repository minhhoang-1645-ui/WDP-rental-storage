import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Keeps every route available while reducing the amount of navigation shown at once. */
export function NavigationGroup({ title, active = false, expanded = false, collapsible = true, children }: { title: string; active?: boolean; expanded?: boolean; collapsible?: boolean; children: ReactNode }) {
  const id = useId();
  const [choice, setChoice] = useState<{ active: boolean; open: boolean }>();
  const open = !collapsible || (choice?.active === active ? choice.open : active || expanded);
  return <div className="workspace-nav-group">
    {collapsible ? <button type="button" className="workspace-nav-heading" aria-expanded={open} aria-controls={id} onClick={() => setChoice({ active, open: !open })}><span>{title}</span><ChevronDown size={14} className={open ? 'is-expanded' : ''} /></button> : <div className="workspace-nav-heading">{title}</div>}
    <div id={id} hidden={!open}>{children}</div>
  </div>;
}

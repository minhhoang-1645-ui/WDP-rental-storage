import type { KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

export function PolicyTabs({ id, label, tabs, current, onChange }: {
  id: string; label: string; tabs: readonly { label: string; icon: LucideIcon }[]; current: number; onChange: (index: number) => void;
}) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    const positions: Record<string, number> = { ArrowLeft: (current + tabs.length - 1) % tabs.length, ArrowRight: (current + 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    const index = positions[event.key];
    if (index === undefined) return;
    event.preventDefault();
    onChange(index);
    document.getElementById(id + '-tab-' + index)?.focus();
  }
  return <div className="policy-tabs" role="tablist" aria-label={label}>
    {tabs.map(({ label, icon: Icon }, index) => <button type="button" key={label} role="tab" id={id + '-tab-' + index} aria-controls={id + '-panel-' + index}
      aria-selected={index === current} tabIndex={index === current ? 0 : -1} onKeyDown={navigate} onClick={() => onChange(index)}>
      <Icon size={17} aria-hidden="true" />{label}
    </button>)}
  </div>;
}

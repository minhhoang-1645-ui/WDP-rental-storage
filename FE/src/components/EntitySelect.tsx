import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { markFormDirty } from '../services/live-events';

type Choice = { value: string; label: string; disabled: boolean };
function plain(value: ReactNode): string { return Children.toArray(value).map(item => isValidElement<{ children?: ReactNode }>(item) ? plain(item.props.children) : String(item)).join(''); }
function choices(children: ReactNode): Choice[] { return Children.toArray(children).flatMap(child => isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child) ? child.type === 'option' ? [{ value: String(child.props.value ?? ''), label: plain(child.props.children), disabled: Boolean(child.props.disabled) }] : choices(child.props.children) : []); }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi');

/** Searchable entity choices retain the native form validation and exact API identifier. */
export function EntitySelect({ value, onValueChange, children, disabled, required, id, name, 'aria-label': ariaLabel, 'aria-describedby': describedBy }: { value?: string | number; onValueChange: (value: string) => void; children: ReactNode; disabled?: boolean; required?: boolean; id?: string; name?: string; 'aria-label'?: string; 'aria-describedby'?: string }) {
  const generated = useId(), listId = `${generated}-choices`, root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [active, setActive] = useState(0), [invalid, setInvalid] = useState(false);
  const all = choices(children), selected = all.find(choice => choice.value === String(value ?? ''));
  const label = ariaLabel || all.find(choice => !choice.value)?.label || 'Chọn thông tin';
  const filtered = all.filter(choice => !search || normalize(choice.label).includes(normalize(search)));
  const enabled = filtered.flatMap((choice, index) => choice.disabled ? [] : [index]);
  const activeIndex = enabled.includes(active) ? active : enabled[0] ?? -1;
  useEffect(() => { if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' }); }, [activeIndex, open, listId]);
  useEffect(() => { if (!open) return; searchInput.current?.focus(); const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close); }, [open]);
  const choose = (choice: Choice) => { if (disabled || choice.disabled) return; const form = button.current?.closest('form'); if (form) markFormDirty(form); onValueChange(choice.value); setInvalid(false); setOpen(false); setSearch(''); button.current?.focus(); };
  function keyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { setOpen(false); button.current?.focus(); event.preventDefault(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); setOpen(true);
      const position = enabled.indexOf(activeIndex);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : !open ? Math.max(0, enabled.indexOf(filtered.findIndex(choice => choice.value === String(value ?? '')))) : Math.max(0, Math.min(enabled.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)));
      setActive(enabled[next] ?? -1);
    }
    if (event.key === 'Enter' && open) { event.preventDefault(); if (filtered[activeIndex]) choose(filtered[activeIndex]); }
  }
  return <div className="entity-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <select className="entity-native-validation" aria-hidden="true" tabIndex={-1} value={value ?? ''} name={name} required={required} disabled={disabled} onChange={event => onValueChange(event.target.value)} onInvalid={event => { event.preventDefault(); setInvalid(true); setOpen(true); button.current?.focus(); }}>{all.map(choice => <option key={choice.value} value={choice.value} disabled={choice.disabled}>{choice.label}</option>)}</select>
    <button ref={button} id={id} type="button" role="combobox" data-value={String(value ?? '')} aria-label={label} aria-describedby={describedBy} aria-expanded={open && !disabled} aria-controls={listId} aria-haspopup="listbox" aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} aria-required={required} aria-invalid={invalid} disabled={disabled} className="entity-select-trigger" onClick={() => { setOpen(current => !current); setSearch(''); setActive(0); }} onKeyDown={keyDown}><span>{selected?.label || all.find(choice => !choice.value)?.label || 'Chọn thông tin'}</span><span aria-hidden="true">⌄</span></button>
    {open && !disabled && <div className="entity-select-popup"><input ref={searchInput} type="search" aria-label={`Tìm ${label.toLocaleLowerCase('vi')}`} placeholder="Tìm theo tên, mã kho, hồ sơ…" value={search} onChange={event => { setSearch(event.target.value); setActive(0); }} onKeyDown={keyDown} aria-controls={listId} aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} /><div id={listId} role="listbox" aria-label={label} className="entity-select-options">{filtered.map((choice, index) => <button type="button" tabIndex={-1} role="option" id={`${listId}-${index}`} data-value={choice.value} aria-selected={choice.value === String(value ?? '')} disabled={choice.disabled} key={choice.value} className={index === activeIndex ? 'is-keyboard-active' : ''} onClick={() => choose(choice)} onKeyDown={keyDown}><strong>{choice.label.split(' · ')[0]}</strong>{choice.label.includes(' · ') && <small>{choice.label.split(' · ').slice(1).join(' · ')}</small>}{choice.value === String(value ?? '') && <span className="entity-check" aria-hidden="true">✓</span>}</button>)}{!filtered.length && <p role="status">Không có lựa chọn phù hợp. Thử tên hoặc mã khác.</p>}</div></div>}
    {invalid && <small role="alert">Vui lòng chọn thông tin trước khi tiếp tục.</small>}
  </div>;
}

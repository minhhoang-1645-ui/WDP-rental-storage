import { Children, cloneElement, isValidElement, type ComponentPropsWithoutRef, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './detail-row.css';

export type RowDetail = { label: string } & ({ to: string } | { open: () => void });

const controls = [
  'a', 'button', 'form', 'input', 'select', 'textarea', 'label', 'summary', '[contenteditable]', '[popover]',
  '[role="button"]', '[role="link"]', '[role="combobox"]', '[role="menuitem"]', '[role="checkbox"]', '[tabindex]:not([tabindex="-1"])',
].join(', ');

function useDetailNavigation(detail: RowDetail | undefined) {
  const location = useLocation();
  const navigate = useNavigate();
  const state = { returnTo: location.pathname + location.search + location.hash };
  const control = !detail ? null : 'to' in detail
    ? <Link className="detail-row-control" aria-label={detail.label} to={detail.to} state={state} onKeyDown={event => {
      if (event.key !== ' ') return;
      event.preventDefault();
      if (!event.repeat) event.currentTarget.click();
    }} />
    : <button type="button" className="detail-row-control" aria-label={detail.label} onClick={detail.open} />;

  function openRecord(event: MouseEvent<HTMLElement>) {
    const target = event.target;
    if (!detail || event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || !(target instanceof Element) || !event.currentTarget.contains(target)
      || window.getSelection()?.type === 'Range') return;
    const interactive = target.closest(controls);
    if (interactive && event.currentTarget.contains(interactive)) return;
    if ('to' in detail) void navigate(detail.to, { state });
    else detail.open();
  }
  return { control, openRecord };
}

export function DetailRow({ detail, children, className, ...props }: ComponentPropsWithoutRef<'tr'> & { detail?: RowDetail }) {
  const { control, openRecord } = useDetailNavigation(detail);
  if (!detail) return <tr className={className} {...props}>{children}</tr>;
  const cells = Children.toArray(children);
  const first = cells[0];
  if (isValidElement(first) && (first.type === 'td' || first.type === 'th')) {
    const cell = first as ReactElement<{ children?: ReactNode }>;
    cells[0] = cloneElement(cell, {}, <>{cell.props.children}{control}</>);
  }
  return <tr {...props} className={['detail-row', className].filter(Boolean).join(' ')} onClick={openRecord}>{cells}</tr>;
}

export function DetailCard({ detail, children, className, ...props }: ComponentPropsWithoutRef<'article'> & { detail?: RowDetail }) {
  const { control, openRecord } = useDetailNavigation(detail);
  if (!detail) return <article className={className} {...props}>{children}</article>;
  return <article {...props} className={['detail-card', className].filter(Boolean).join(' ')} onClick={openRecord}>{children}{control}</article>;
}

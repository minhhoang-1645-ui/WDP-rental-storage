import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Modal } from '../manager/PortalUi';
import './confirmation.css';

type Confirmation = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

const ConfirmationContext = createContext<((options: Confirmation) => Promise<boolean>) | null>(null);

export function useConfirmation() {
  const request = useContext(ConfirmationContext);
  if (!request) throw new Error('ConfirmationProvider is missing.');
  return request;
}

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const [dialog, setDialog] = useState<Confirmation & { nested: boolean }>();
  const finish = useCallback((accepted: boolean) => {
    const resolve = pending.current;
    if (!resolve) return;
    pending.current = null;
    setDialog(undefined);
    resolve(accepted);
  }, []);

  useEffect(() => { finish(false); }, [location.key, finish]);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);

  const request = useCallback((options: Confirmation) => {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      pending.current = resolve;
      setDialog({ ...options, nested: Boolean(document.querySelector('dialog:modal')) });
    });
  }, []);

  const workspace = dialog ? document.querySelector('.internal-web.workspace-themed') : null;
  const confirmation = dialog && <Modal title={dialog.title} focusTitle className={`workspace-confirmation${dialog.nested ? ' is-nested' : ''}`}
    onClose={() => finish(false)} footer={<>
      <button type="button" className="button-secondary" onClick={() => finish(false)}>{dialog.cancelLabel ?? 'Hủy'}</button>
      <button type="button" className={dialog.destructive ? 'button-secondary portal-danger' : 'button-primary'} onClick={() => finish(true)}>{dialog.confirmLabel}</button>
    </>}>
    <p>{dialog.description}</p>
  </Modal>;

  return <ConfirmationContext.Provider value={request}>
    {children}
    {workspace ? createPortal(confirmation, workspace) : confirmation}
  </ConfirmationContext.Provider>;
}

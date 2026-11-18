import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function useStaffProcessingTarget(ready: boolean) {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!ready || hash !== '#staff-processing') return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById('staff-processing');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, hash, key]);
}

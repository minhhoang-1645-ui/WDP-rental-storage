import { useEffect, useState } from 'react';

export function useCurrentTime(active = true, interval = 15_000) {
  const [time, setTime] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setTime(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [active, interval]);
  return time;
}

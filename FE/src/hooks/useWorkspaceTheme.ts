import { useEffect, useState } from 'react';
import { safeLocalStorage } from '../services/browser-storage';

const themeKey = 'nestbox-workspace-theme';
const themeEvent = 'nestbox-workspace-theme-change';
export type WorkspaceTheme = 'light' | 'dark';

function readTheme(): WorkspaceTheme {
  return safeLocalStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light';
}

export function useWorkspaceTheme(enabled: boolean) {
  const [theme, setCurrentTheme] = useState(readTheme);
  useEffect(() => {
    if (!enabled) return;
    const syncTheme = () => setCurrentTheme(readTheme());
    const onStorage = (event: StorageEvent) => {
      if (event.key === themeKey || event.key === null) syncTheme();
    };
    syncTheme();
    window.addEventListener('storage', onStorage);
    window.addEventListener(themeEvent, syncTheme);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(themeEvent, syncTheme);
    };
  }, [enabled]);

  function setTheme(next: WorkspaceTheme) {
    safeLocalStorage.setItem(themeKey, next);
    setCurrentTheme(next);
    window.dispatchEvent(new Event(themeEvent));
  }

  return { theme, setTheme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}

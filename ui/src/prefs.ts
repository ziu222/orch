import { useEffect, useState } from 'react';

export interface Prefs { mode: 'system' | 'light' | 'dark'; paper: 'lines' | 'dots' | 'plain'; density: 'comfy' | 'compact' }
const KEY = 'orch-prefs';
const DEFAULTS: Prefs = { mode: 'system', paper: 'lines', density: 'comfy' };

function load(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; }
}

/** Preferences live in this browser only; they are applied as attributes and classes on <html>. */
export function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(load);
  useEffect(() => {
    const r = document.documentElement;
    if (prefs.mode === 'system') r.removeAttribute('data-theme'); else r.dataset.theme = prefs.mode;
    r.classList.toggle('compact', prefs.density === 'compact');
    r.classList.toggle('pg-dots', prefs.paper === 'dots');
    r.classList.toggle('pg-plain', prefs.paper === 'plain');
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private window */ }
  }, [prefs]);
  return [prefs, p => setPrefs(prev => ({ ...prev, ...p }))];
}

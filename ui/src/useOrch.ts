import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type UiState, type Vendor } from './api.ts';
import { SAMPLE_DIFF, sampleState } from './sample.ts';

const POLL_MS = 1500;
const DEMO_NOTE = 'Đang xem dữ liệu mẫu. Chạy `orch ui` trong repo của bạn để điều khiển thật.';

export interface Actions {
  run(request: string): Promise<void>;
  answer(task: string, text: string): Promise<void>;
  cancel(task: string): Promise<void>;
  stop(): Promise<void>;
  saveAgents(text: string): Promise<boolean>;
  setSkill(name: string, vendor: Vendor, on: boolean): Promise<void>;
  diff(task: string, path: string): Promise<string>;
}

export interface Orch {
  state: UiState;
  /** true when the numbers come from a running `orch ui`; false for the built-in sample */
  live: boolean;
  /** the connection dropped after having worked */
  offline: boolean;
  notice: string | null;
  actions: Actions;
}

export function useOrch(): Orch {
  const [state, setState] = useState<UiState>(sampleState);
  const [live, setLive] = useState(false);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const everLive = useRef(false);
  const fails = useRef(0);
  const liveRef = useRef(false);
  const timer = useRef<number>(0);

  const say = useCallback((msg: string) => {
    setNotice(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      everLive.current = true; liveRef.current = true; fails.current = 0;
      setState(s); setLive(true); setOffline(false);
    } catch {
      fails.current += 1;
      if (everLive.current && fails.current >= 3) setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // every write: refuse politely in demo mode, report api errors as a notice, then refresh at once
  const act = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (!liveRef.current) { say(DEMO_NOTE); return undefined; }
    try { const r = await fn(); await refresh(); return r; }
    catch (e) { say((e as Error).message); return undefined; }
  }, [refresh, say]);

  const actions: Actions = {
    run: async request => { await act(() => api.run(request)); },
    answer: async (task, text) => { await act(() => api.answer(task, text)); },
    cancel: async task => { await act(() => api.cancel(task)); },
    stop: async () => { await act(() => api.stop()); },
    saveAgents: async text => (await act(() => api.saveAgents(text))) !== undefined,
    setSkill: async (name, vendor, on) => { await act(() => api.setSkill(name, vendor, on)); },
    diff: async (task, path) => (liveRef.current ? api.diff(task, path).catch(() => '') : SAMPLE_DIFF),
  };

  return { state, live, offline, notice, actions };
}

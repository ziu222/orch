import type { ChatMsg, UiFile, UiSkill, UiState, UiTask, UiVendor } from '../../src/ui-types.ts';
import type { Vendor } from '../../src/types.ts';

export type { ChatMsg, UiFile, UiSkill, UiState, UiTask, UiVendor, Vendor };

// `orch ui` injects a per-process token into index.html; only pages it served can read it
const token = () => document.querySelector<HTMLMetaElement>('meta[name="orch-token"]')?.content ?? '';

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(path, {
    method,
    headers: { 'x-orch-token': token(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error ?? msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return res;
}

export const api = {
  state: async (): Promise<UiState> => (await call('GET', '/api/state')).json(),
  diff: async (task: string, path: string): Promise<string> =>
    (await call('GET', `/api/diff?task=${encodeURIComponent(task)}&path=${encodeURIComponent(path)}`)).text(),
  run: (request: string) => call('POST', '/api/run', { request }),
  answer: (task: string, text: string) => call('POST', '/api/answer', { task, text }),
  cancel: (task: string) => call('POST', '/api/cancel', { task }),
  stop: () => call('POST', '/api/stop'),
  saveAgents: (text: string) => call('PUT', '/api/agents-md', { text }),
  setSkill: (name: string, vendor: Vendor, on: boolean) => call('PUT', '/api/skills', { name, vendor, on }),
};

export type Api = typeof api;

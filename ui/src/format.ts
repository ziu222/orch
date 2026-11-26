import type { UiTask } from './api.ts';

/** non-breaking space: keeps "1,2k tok" and "chờ T-015" on one line */
export const NB = ' ';
export const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (d: Date | string | number) => {
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
export const fmtK = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(n)));
export const fmtN = (n: number) => Math.round(n).toLocaleString('vi-VN');
export const dur = (secs: number) => `${Math.floor(secs / 60)} ph ${pad(Math.round(secs % 60))} s`;
export const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export function remain(iso: string, now: number): string {
  const m = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  return `${m >= 60 ? Math.floor(m / 60) + ' g ' : ''}${pad(m % 60)} ph`;
}

export const STATUS_VI: Record<UiTask['status'], string> = {
  done: 'xong', running: 'đang chạy', queued: 'đang chờ', failed: 'lỗi', cancelled: 'đã hủy', blocked: 'chờ trả lời', review: 'đang review',
};

/** the short second line of a graph node: what the task is waiting for, or what it used */
export function taskMeta(t: UiTask, byId: Map<string, UiTask>): string {
  if (t.status === 'blocked') {
    if (t.question) return ['chờ', 'bạn', 'trả', 'lời'].join(NB);
    return t.reason?.startsWith('dependency') ? `bị${NB}chặn${NB}bởi${NB}${t.reason.split(' ')[1]}` : `bị${NB}chặn`;
  }
  if (t.status === 'queued') {
    if (t.reason?.startsWith('rate limited')) return ['chờ', 'hãng', 'mở', 'lại'].join(NB);
    const pending = t.deps.filter(d => byId.get(d)?.status !== 'done');
    if (pending.length > 1) return `chờ${NB}${pending.length}${NB}task`;
    if (pending.length === 1) return `chờ${NB}${pending[0]}`;
    return ['đang', 'xếp', 'hàng'].join(NB);
  }
  if (t.status === 'failed') return `lỗi`;
  if (t.status === 'cancelled') return `đã${NB}hủy`;
  return `${fmtK(t.tokensIn + t.tokensOut)}${NB}tok`;
}

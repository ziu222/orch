import type { UiState } from '../api.ts';
import { fmtK } from '../format.ts';

export function Tally({ state }: { state: UiState }) {
  const n = (s: string) => state.tasks.filter(t => t.status === s).length;
  const tokens = state.vendors.reduce((s, v) => s + v.tokensTotal, 0);
  const local = state.vendors.filter(v => v.local).reduce((s, v) => s + v.tokensTotal, 0);
  return (
    <div className="tally" style={{ padding: 0 }}>
      <span><b>{n('done')}</b>task xong</span>
      <span><b>{n('failed')}</b>lỗi</span>
      <span><b>{state.questions.length}</b>chờ trả lời</span>
      <span><b>{fmtK(tokens)}</b>token tổng</span>
      <span><b>{fmtK(local)}</b>token chạy trên máy, không tốn quota</span>
    </div>
  );
}

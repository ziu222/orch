import { useState } from 'react';
import type { UiState } from '../api.ts';
import { fmtN, hhmm } from '../format.ts';

export function Log({ state }: { state: UiState }) {
  const [vendor, setVendor] = useState('');
  const rows = state.runs.filter(r => !vendor || r.vendor === vendor).slice().reverse();
  return (
    <section className="panel on" role="tabpanel" aria-labelledby="t-log">
      <div className="toolbar">
        <h2>runs.jsonl</h2>
        <label htmlFor="log-vendor" className="sr">Lọc theo hãng</label>
        <select id="log-vendor" value={vendor} onChange={e => setVendor(e.target.value)}>
          <option value="">Mọi hãng</option>
          {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      <div className="tablewrap box">
        <table className="log">
          <thead><tr><th>Giờ</th><th>Task</th><th>Hãng</th><th>Sự kiện</th><th style={{ textAlign: 'right' }}>Token</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const v = state.vendors.find(x => x.id === r.vendor);
              const tok = r.tokensIn + r.tokensOut;
              return (
                <tr key={i}>
                  <td>{hhmm(r.ts)}</td><td className="mono">{r.task}</td>
                  <td><span className="vm">{v?.code ?? '??'}</span> {v?.name ?? r.vendor}</td>
                  <td>{r.event}</td><td style={{ textAlign: 'right' }}>{tok ? fmtN(tok) : '—'}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="note">Chưa có sự kiện nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

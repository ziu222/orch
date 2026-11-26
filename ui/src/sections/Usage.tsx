import type { UiState } from '../api.ts';
import { fmtK, hhmm } from '../format.ts';

export function Usage({ state }: { state: UiState }) {
  return (
    <section className="panel on" role="tabpanel" aria-labelledby="t-usage">
      <p className="note">
        Token đọc từ output JSON của từng CLI và cộng theo cửa sổ 5 giờ và 7 ngày. Phần trăm chỉ hiện khi bạn đặt{' '}
        <span className="mono">budget5h</span> / <span className="mono">budgetWeek</span> cho hãng đó trong{' '}
        <span className="mono">.orch/config.json</span>; hãng không công bố hạn mức thì orch không đoán.
      </p>
      <div className="tablewrap">
        <table className="ledger">
          <thead>
            <tr><th>Hãng</th><th>5 giờ</th><th>Tuần</th><th className="r">Token tổng</th><th>5 giờ qua · mỗi cột 15 phút</th><th className="r">Song song</th><th>Ghi chú</th></tr>
          </thead>
          <tbody>
            {state.vendors.map(v => {
              const peak = Math.max(1, ...v.hist);
              const cell = (pct: number | undefined, tokens: number) => pct === undefined
                ? <td>{fmtK(tokens)}</td>
                : <td><span className="lm"><span className={`track${pct >= 80 ? ' hot' : ''}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></span><b>{pct}%</b></span></td>;
              return (
                <tr key={v.id}>
                  <td><span className="vn"><span className="vm">{v.code}</span>{v.name}</span></td>
                  {v.local ? <td className="dim" colSpan={2}>không có quota · {v.model}</td> : <>{cell(v.pct5h, v.tokens5h)}{cell(v.pctWeek, v.tokensWeek)}</>}
                  <td className="r">{fmtK(v.tokensTotal)}</td>
                  <td>
                    <span className="spark" role="img" aria-label={`Token mỗi 15 phút trong 5 giờ qua, đỉnh ${fmtK(peak)}`}>
                      <span className="sbars">{v.hist.map((h, i) => <i key={i} className={i === v.hist.length - 1 ? 'now' : ''} style={{ height: `${Math.max(6, (h / peak) * 100)}%` }} />)}</span>
                      <span className="scale"><span>{fmtK(peak)}</span><span>0</span></span>
                    </span>
                  </td>
                  <td className="r">{v.running.length} / {v.maxParallel}</td>
                  <td className="src">{v.pausedUntil ? `ngừng giao đến ${hhmm(v.pausedUntil)}` : v.local ? 'chạy trên máy' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

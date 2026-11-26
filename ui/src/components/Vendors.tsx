import type { UiVendor, Vendor } from '../api.ts';
import { fmtK, hhmm, remain } from '../format.ts';
import { Square } from './Defs.tsx';

function Meter({ label, pct, tokens }: { label: string; pct?: number; tokens: number }) {
  if (pct === undefined) {
    return (
      <span className="meter">
        <span className="lbl">{label}</span>
        <span className="lbl" style={{ gridColumn: 'span 2' }}>{fmtK(tokens)} token</span>
      </span>
    );
  }
  return (
    <span className="meter">
      <span className="lbl">{label}</span>
      <span className={`track${pct >= 80 ? ' hot' : ''}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></span>
      <b>{pct}%</b>
    </span>
  );
}

/** one box per vendor: quota or tokens, queue, and a filter toggle for the graph */
export function Vendors({ vendors, now, filter, onFilter }: {
  vendors: UiVendor[]; now: number; filter: Vendor | null; onFilter(v: Vendor | null): void;
}) {
  return (
    <div className="vendors box">
      {vendors.map(v => {
        const paused = !!v.pausedUntil;
        const hot = paused || (v.pct5h ?? 0) >= 80;
        return (
          <button key={v.id} type="button" className="q" aria-pressed={filter === v.id} aria-label={`Lọc đồ thị theo ${v.name}`}
            onClick={() => onFilter(filter === v.id ? null : v.id)}>
            <span className="vn">
              <span className={`vm${filter === v.id ? ' solid' : ''}`}>{v.code}</span>{v.name}
              <span className="tag">{v.local ? 'local' : v.pct5h !== undefined ? 'theo ngân sách' : 'token'}</span>
            </span>
            {v.local ? (
              <>
                <span className="meter"><span className="lbl">Model</span><span className="mono" style={{ gridColumn: 'span 2' }}>{v.model}</span></span>
                <span className="meter"><span className="lbl">Quota</span><span style={{ gridColumn: 'span 2' }}>không giới hạn · chạy trên máy</span></span>
              </>
            ) : (
              <>
                <Meter label="5 giờ" pct={v.pct5h} tokens={v.tokens5h} />
                <Meter label="Tuần" pct={v.pctWeek} tokens={v.tokensWeek} />
              </>
            )}
            <span className="queue">
              {v.running.map(id => <span key={id} className="run"><Square running /> {id}</span>)}
              {v.waiting.map(w => <span key={w.id}><Square /> {w.id} · {w.why}</span>)}
              {!v.running.length && !v.waiting.length && <span>hàng đợi trống</span>}
            </span>
            <span className="qfoot">
              <span>{paused ? `ngừng giao đến ${hhmm(v.pausedUntil!)} · còn ${remain(v.pausedUntil!, now)}` : `tổng ${fmtK(v.tokensTotal)} token`}</span>
              <span className={hot ? 'hot' : ''}>{paused ? 'ngừng giao · ' : ''}chạy {v.running.length}/{v.maxParallel}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

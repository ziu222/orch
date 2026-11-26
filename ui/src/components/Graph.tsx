import { useEffect, useMemo, useRef, useState } from 'react';
import type { UiTask, UiVendor, Vendor } from '../api.ts';
import { STATUS_VI, taskMeta } from '../format.ts';

const GX = 24;
const IND = 12;

let ctx: CanvasRenderingContext2D | null = null;
function wrap(str: string, px: number, font: string): string[] {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.font = font;
  const out: string[] = [];
  let line = '';
  for (const w of str.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(t).width > px) { out.push(line); line = w; } else line = t;
  }
  out.push(line);
  return out;
}

interface Placed { x: number; y: number; h: number; tl: string[]; ml: string[] }
interface Layout { W: number; width: number; height: number; at: Map<string, Placed>; edges: { key: string; d: string; live: boolean }[] }

// top-down layers (row = depth). On a phone: one node per row, indented by depth, edges in the left gutter.
function layoutGraph(tasks: UiTask[], vendors: Map<Vendor, UiVendor>, cw: number, narrow: boolean): Layout {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const depth = new Map<string, number>();
  const depthOf = (t: UiTask, seen: Set<string>): number => {
    const known = depth.get(t.id);
    if (known !== undefined) return known;
    if (seen.has(t.id)) return 0;
    seen.add(t.id);
    const parents = t.deps.map(d => byId.get(d)).filter((x): x is UiTask => !!x);
    const v = parents.length ? 1 + Math.max(...parents.map(p => depthOf(p, seen))) : 0;
    depth.set(t.id, v);
    return v;
  };
  tasks.forEach(t => depthOf(t, new Set()));
  const d = (t: UiTask) => depth.get(t.id) ?? 0;
  const maxD = Math.max(0, ...tasks.map(d));
  const perRow = new Map<number, number>();
  tasks.forEach(t => perRow.set(d(t), (perRow.get(d(t)) ?? 0) + 1));
  const maxC = Math.max(1, ...perRow.values());
  const GY = narrow ? 16 : 26;
  const W = narrow ? Math.max(200, cw - 36 - maxD * IND) : Math.max(132, Math.min(200, Math.floor((cw - 32 - GX * (maxC - 1)) / maxC)));

  const lines = new Map(tasks.map(t => [t.id, {
    tl: wrap(t.title, W - 44, '600 13.5px Archivo'),
    ml: wrap(`${vendors.get(t.vendor)?.name ?? t.vendor} · ${taskMeta(t, byId)}`, W - 40, '12px Archivo'),
  }]));
  // node height = the text it holds + 12px bottom padding
  const need = (t: UiTask) => Math.max(64, 38 + lines.get(t.id)!.tl.length * 17 + lines.get(t.id)!.ml.length * 15);

  const at = new Map<string, Placed>();
  if (narrow) {
    let y = 14;
    for (const t of [...tasks].sort((a, b) => d(a) - d(b))) {
      const h = need(t);
      at.set(t.id, { x: 24 + d(t) * IND, y, h, ...lines.get(t.id)! });
      y += h + GY;
    }
  } else {
    const rowH = new Map<number, number>();
    tasks.forEach(t => rowH.set(d(t), Math.max(rowH.get(d(t)) ?? 0, need(t))));
    const rowY = new Map<number, number>();
    let y = 18;
    for (let r = 0; r <= maxD; r++) { rowY.set(r, y); y += (rowH.get(r) ?? 0) + GY; }
    const col = new Map<number, number>();
    for (const t of tasks) {
      const c = col.get(d(t)) ?? 0;
      col.set(d(t), c + 1);
      at.set(t.id, { x: 16 + c * (W + GX), y: rowY.get(d(t))!, h: rowH.get(d(t))!, ...lines.get(t.id)! });
    }
  }

  const edges: Layout['edges'] = [];
  for (const t of tasks) {
    for (const dep of t.deps) {
      const a = at.get(dep), b = at.get(t.id);
      if (!a || !b) continue;
      const path = narrow
        ? `M${a.x} ${a.y + a.h / 2}H${a.x - 10}V${b.y + b.h / 2}H${b.x - 5}`
        : `M${a.x + W / 2} ${a.y + a.h}V${b.y - GY / 2}H${b.x + W / 2}V${b.y - 5}`;
      edges.push({ key: `${dep}>${t.id}`, d: path, live: byId.get(dep)?.status === 'done' && t.status === 'running' });
    }
  }
  const placed = [...at.values()];
  return {
    W, at, edges,
    width: Math.max(0, ...placed.map(p => p.x)) + W + (narrow ? 8 : 24),
    height: Math.max(0, ...placed.map(p => p.y + p.h)) + 16,
  };
}

const nodeClass = (s: UiTask['status']) => (s === 'failed' ? 'error' : s === 'review' ? 'running' : s);

export function Graph({ tasks, vendors, selected, filter, onSelect }: {
  tasks: UiTask[]; vendors: UiVendor[]; selected: string | null; filter: Vendor | null; onSelect(id: string): void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [fontsReady, setFontsReady] = useState(false);
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 560);

  useEffect(() => {
    const el = canvas.current!;
    const measure = () => { setWidth(el.clientWidth || 600); setNarrow(window.innerWidth <= 560); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { void document.fonts?.ready.then(() => setFontsReady(true)); }, []);

  const byVendor = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);
  const layout = useMemo(() => layoutGraph(tasks, byVendor, width, narrow), [tasks, byVendor, width, narrow, fontsReady]);

  // keep the selected node visible beside the detail card
  useEffect(() => {
    const p = selected ? layout.at.get(selected) : undefined;
    const c = canvas.current;
    if (p && c && p.x + layout.W > c.scrollLeft + c.clientWidth) c.scrollLeft = Math.max(0, p.x - 16);
  }, [selected, layout]);

  return (
    <section className="graph box" aria-label="Đồ thị task">
      <header>
        <h2>Đồ thị task</h2>
        <span className="legend">
          <span><svg viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" fill="var(--ink)" /><path d="M4.5 7l2 2 3.5-4" fill="none" stroke="var(--paper)" strokeWidth="1.6" /></svg>xong</span>
          <span><svg viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" fill="url(#half)" stroke="var(--ink)" strokeWidth="1.5" /></svg>đang chạy</span>
          <span><svg viewBox="0 0 14 14"><rect x="1" y="3" width="12" height="8" fill="none" stroke="var(--ink-2)" strokeDasharray="3 2" /></svg>chờ</span>
          <span><svg viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" fill="url(#hatch)" stroke="var(--ink)" strokeWidth="1.5" /></svg>lỗi</span>
        </span>
      </header>
      <div className="canvas" ref={canvas}>
        {tasks.length === 0 ? (
          <p className="note" style={{ padding: 16 }}>Chưa có task nào. Gõ yêu cầu ở khung chat để orch lập kế hoạch.</p>
        ) : (
          <svg className="dag" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="Đồ thị phụ thuộc giữa các task">
            <defs>
              <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--ink-2)" /></marker>
            </defs>
            {layout.edges.map(e => <path key={e.key} className={`edge${e.live ? ' live' : ''}`} d={e.d} markerEnd="url(#ah)" />)}
            {tasks.map(t => {
              const p = layout.at.get(t.id)!;
              const v = byVendor.get(t.vendor);
              const W = layout.W;
              const dim = filter && t.vendor !== filter;
              const limited = t.status === 'failed' && /rate limit/i.test(t.reason ?? '');
              return (
                <g key={t.id} className={`node s-${nodeClass(t.status)}${selected === t.id ? ' sel' : ''}`} tabIndex={0} role="button"
                  aria-label={`${t.id} ${t.title}, ${STATUS_VI[t.status]}, ${v?.name ?? t.vendor}`} style={{ opacity: dim ? 0.3 : undefined }}
                  onClick={() => onSelect(t.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(t.id); } }}>
                  <rect className="lr" x={p.x} y={p.y} width={W} height={p.h} rx="2" />
                  <rect className="box-st" x={p.x + 10} y={p.y + p.h / 2 - 7} width="14" height="14" />
                  {t.status === 'done' && <path className="tick" d={`M${p.x + 13} ${p.y + p.h / 2}l3 3 5-6`} />}
                  {t.status === 'running' && <circle className="pulse" cx={p.x + W - 40} cy={p.y + 16} r="3" />}
                  <g className="vmk">
                    <rect x={p.x + W - 30} y={p.y + 9} width="22" height="14" rx="1.5" />
                    <text x={p.x + W - 19} y={p.y + 19.5} textAnchor="middle">{v?.code ?? '??'}</text>
                  </g>
                  <text className="nid" x={p.x + 32} y={p.y + 22}>{t.id}</text>
                  {p.tl.map((s, i) => <text key={i} className="nt" x={p.x + 32} y={p.y + 41 + i * 17}>{s}</text>)}
                  {p.ml.map((s, i) => <text key={i} className="nm" x={p.x + 32} y={p.y + 41 + p.tl.length * 17 + i * 15}>{s}</text>)}
                  {t.status === 'failed' && (
                    <g className="stamp" transform={`rotate(-3 ${p.x + W - 49} ${p.y})`}>
                      <rect x={p.x + W - 90} y={p.y - 11} width="82" height="20" />
                      <text x={p.x + W - 82} y={p.y + 3}>{limited ? 'rate limit' : 'lỗi'}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </section>
  );
}

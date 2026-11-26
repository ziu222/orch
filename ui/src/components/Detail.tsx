import type { UiTask, UiVendor } from '../api.ts';
import type { Actions } from '../useOrch.ts';
import { STATUS_VI, dur, fmtN } from '../format.ts';

/** the index card that replaces the margin column while a task is selected */
export function Detail({ task, vendor, running, actions, onClose }: {
  task: UiTask; vendor?: UiVendor; running: boolean; actions: Actions; onClose(): void;
}) {
  const t = task;
  const done = t.status === 'done' || t.status === 'running';
  return (
    <aside className="detail box" aria-live="polite">
      <button type="button" className="iconbtn close" aria-label="Đóng chi tiết" onClick={onClose}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M3 3l10 10M13 3L3 13" /></svg>
      </button>
      <h3>{t.id} · {t.title}</h3>
      <span className={`state ${t.status === 'failed' ? 'error' : done ? t.status : ''}`}>{STATUS_VI[t.status]}</span>
      {t.status === 'failed' && t.reason && <div className="errslip">{t.reason}</div>}
      {t.question && <p className="hand" style={{ margin: '10px 0 0' }}>“{t.question}”</p>}
      <dl className="kv">
        <dt>Hãng</dt><dd>{vendor?.name ?? t.vendor}</dd>
        <dt>Vai trò</dt><dd>{t.role}{t.reviewOf ? ` (review ${t.reviewOf}, vòng ${t.round ?? 1})` : ''}</dd>
        <dt>Phụ thuộc</dt><dd>{t.deps.length ? t.deps.join(', ') : 'không'}</dd>
        <dt>Token vào / ra</dt><dd>{fmtN(t.tokensIn)} / {fmtN(t.tokensOut)}</dd>
        <dt>Thời gian</dt><dd>{dur(t.secs)}</dd>
        {t.worktree && <><dt>Worktree</dt><dd className="mono">{t.worktree.replace(/^.*[\\/]\.orch[\\/]/, '.orch/').replace(/\\/g, '/')}</dd></>}
        <dt>Verified</dt><dd>{t.verified === undefined ? '—' : t.verified ? 'có' : 'không'}</dd>
      </dl>
      {t.report
        ? <p className="report">{t.report.summary}</p>
        : t.status === 'running' && <p className="report">Đang chạy. Báo cáo sẽ hiện khi worker ghi report.json.</p>}
      <div className="out">.orch/<wbr />tasks/<wbr />{t.id}/<wbr />report.json</div>
      <div className="actions">
        {(t.status === 'queued' || t.status === 'blocked') && <button type="button" className="btn small ghost" onClick={() => void actions.cancel(t.id)}>Hủy task</button>}
        {t.status === 'running' && running && <button type="button" className="btn small ghost" onClick={() => void actions.stop()}>Dừng lượt chạy</button>}
      </div>
    </aside>
  );
}

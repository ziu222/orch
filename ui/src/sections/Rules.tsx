import { useEffect, useState } from 'react';
import type { UiState, Vendor } from '../api.ts';
import type { Actions } from '../useOrch.ts';

const READS: [string, string, string, string][] = [
  ['CL', 'Claude Code', 'prompt của mỗi task', 'orch nhúng luật (AGENTS.md) và skill đã bật vào đầu prompt'],
  ['CX', 'Codex CLI', 'prompt của mỗi task', 'cùng cách: luật và skill nằm trong prompt, không phụ thuộc file trong worktree'],
  ['AG', 'Antigravity', 'prompt của mỗi task', 'cùng cách'],
  ['CP', 'Copilot CLI', 'prompt của mỗi task', 'cùng cách'],
  ['OL', 'Ollama', 'prompt của mỗi task', 'cùng cách'],
];

export function Rules({ state, actions }: { state: UiState; actions: Actions }) {
  const [text, setText] = useState(state.agentsMd);
  const [saved, setSaved] = useState(state.agentsMd);
  const [status, setStatus] = useState('');

  // follow the file on disk while there is nothing unsaved
  useEffect(() => {
    if (text === saved && state.agentsMd !== saved) { setText(state.agentsMd); setSaved(state.agentsMd); }
  }, [state.agentsMd, text, saved]);

  const save = async () => {
    if (await actions.saveAgents(text)) { setSaved(text); setStatus(`Đã lưu lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}. Lần chạy tới orch nhúng luật này vào prompt.`); }
  };

  return (
    <section className="panel on" role="tabpanel" aria-labelledby="t-rules">
      <p className="note">Luật chung và skill ở đây áp dụng cho mọi agent. orch nhúng luật và skill đã bật vào đầu prompt của từng task, nên worker trong worktree vẫn thấy dù file chưa commit.</p>
      <div className="rules">
        <div className="rcol">
          <section className="box grow" aria-labelledby="h-agents">
            <header>
              <h2 id="h-agents">Luật chung · AGENTS.md</h2>
              <span className="row">
                <button className="btn small ghost" type="button" onClick={() => { setText(saved); setStatus('Đã bỏ các thay đổi chưa lưu.'); }}>Hoàn tác</button>
                <button className="btn small" type="button" onClick={() => void save()}>Lưu</button>
              </span>
            </header>
            <label htmlFor="agents-md" className="sr">Nội dung AGENTS.md</label>
            <textarea id="agents-md" className="agentsmd" spellCheck={false} value={text}
              onChange={e => { setText(e.target.value); setStatus(e.target.value === saved ? '' : 'Có thay đổi chưa lưu.'); }} />
            <div className="status" role="status" style={{ padding: '6px 12px', borderTop: '1px solid var(--line-2)' }}>{status}</div>
          </section>
          <section className="box" aria-labelledby="h-reads">
            <header><h2 id="h-reads">Mỗi agent nhận luật bằng cách nào</h2></header>
            <table className="reads"><tbody>
              {READS.map(([code, name, where, how]) => (
                <tr key={code}><td><span className="vm">{code}</span> {name}</td><td><span className="mono">{where}</span>, {how}</td></tr>
              ))}
            </tbody></table>
          </section>
        </div>
        <section className="box" aria-labelledby="h-skills">
          <header><h2 id="h-skills">Skill dùng chung</h2><span className="hint">Tích để agent được dùng skill</span></header>
          <div className="tablewrap">
            <table className="skills">
              <thead><tr><th>Skill</th>{state.vendors.map(v => <th key={v.id}>{v.code}</th>)}</tr></thead>
              <tbody>
                {state.skills.map(s => (
                  <tr key={s.name}>
                    <td><span className="sname">{s.name}</span><span className="spath">{s.path}</span></td>
                    {state.vendors.map(v => (
                      <td key={v.id}>
                        <label className="cb">
                          <input type="checkbox" checked={!!s.on[v.id]} aria-label={`${s.name} cho ${v.name}`}
                            onChange={e => void actions.setSkill(s.name, v.id as Vendor, e.target.checked)} />
                          <svg viewBox="0 0 14 14"><path d="M2.5 7.5l3 3 6-7" /></svg>
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="status" style={{ padding: '10px 12px' }}>
            {state.skills.length ? 'Thêm skill: tạo thư mục skills/<tên>/ có file SKILL.md trong repo.' : 'Chưa có skill nào. Tạo thư mục skills/<tên>/ có file SKILL.md trong repo để nó hiện ở đây.'}
          </div>
        </section>
      </div>
    </section>
  );
}

import type { Prefs } from '../prefs.ts';

function Choice<K extends keyof Prefs>({ legend, name, value, options, onChange }: {
  legend: string; name: K; value: Prefs[K]; options: [Prefs[K], string][]; onChange(v: Prefs[K]): void;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="seg">
        {options.map(([v, label]) => (
          <label key={v}><input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} /><span>{label}</span></label>
        ))}
      </div>
    </fieldset>
  );
}

export function Appearance({ prefs, set }: { prefs: Prefs; set(p: Partial<Prefs>): void }) {
  return (
    <section className="panel on" role="tabpanel" aria-labelledby="t-theme">
      <form className="prefs" onSubmit={e => e.preventDefault()}>
        <Choice legend="Chế độ" name="mode" value={prefs.mode} onChange={mode => set({ mode })}
          options={[['system', 'Theo hệ thống'], ['light', 'Ngày'], ['dark', 'Đêm']]} />
        <Choice legend="Kiểu trang" name="paper" value={prefs.paper} onChange={paper => set({ paper })}
          options={[['lines', 'Kẻ ngang'], ['dots', 'Chấm'], ['plain', 'Trơn']]} />
        <Choice legend="Mật độ" name="density" value={prefs.density} onChange={density => set({ density })}
          options={[['comfy', 'Thoải mái'], ['compact', 'Gọn']]} />
        <p className="note">
          Trang sổ dùng một màu xanh mực; chỉ tab và giấy note mang màu. Các hãng phân biệt bằng ô chữ viết tắt (CL, CX, AG, CP, OL),
          trạng thái phân biệt bằng kiểu tô. Lựa chọn được lưu trong trình duyệt này.
        </p>
      </form>
    </section>
  );
}

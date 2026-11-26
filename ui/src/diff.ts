export interface DiffLine { kind: 'hd' | 'add' | 'del' | 'ctx'; text: string }

// everything git prints before the first hunk, and per-file metadata between hunks
const HEADER = /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|rename (from|to)|Binary files)/;

/** Turns `git diff` output into lines the console can colour; header lines are dropped. */
export function parseDiff(text: string): DiffLine[] {
  if (!text.trim()) return [];
  const out: DiffLine[] = [];
  for (const l of text.split(/\r?\n/)) {
    if (!l || HEADER.test(l) || l.startsWith('\\')) continue;
    if (l.startsWith('@@')) out.push({ kind: 'hd', text: l });
    else if (l[0] === '+') out.push({ kind: 'add', text: l.slice(1) });
    else if (l[0] === '-') out.push({ kind: 'del', text: l.slice(1) });
    else out.push({ kind: 'ctx', text: l.slice(1) });
  }
  return out;
}

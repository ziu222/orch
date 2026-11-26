/** SVG fills shared by the legend, the graph nodes and the queue squares: hatch = failed, half = running. */
export function Defs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="var(--paper)" />
          <rect width="2" height="4" fill="var(--ink)" />
        </pattern>
        <linearGradient id="half" x1="0" y1="1" x2="0" y2="0">
          <stop offset=".5" stopColor="var(--ink)" />
          <stop offset=".5" stopColor="var(--paper)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** the queue marker: half-filled square = running, dashed square = waiting */
export function Square({ running }: { running?: boolean }) {
  return (
    <svg className="sq" viewBox="0 0 12 12" aria-hidden="true">
      {running
        ? <rect x="1" y="1" width="10" height="10" fill="url(#half)" stroke="currentColor" strokeWidth="1.5" />
        : <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.5 1.5" />}
    </svg>
  );
}

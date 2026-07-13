/**
 * Hero scene: one .ctxfile in the middle, agent windows around it, context
 * packets traveling along the beams. Pure SVG + CSS (no JS): floats, beam
 * flow, and packets on CSS offset-path. All motion is gated behind
 * prefers-reduced-motion and @supports(offset-path), so it degrades to a
 * clean still illustration. Colors ride the site tokens so both themes work;
 * the panels are LCD screens and stay dark by design.
 */

const STYLE = `
.ctv { display: block; width: 100%; height: auto; }
.ctv .p { fill: var(--screen); stroke: var(--line-strong); stroke-width: 1; }
.ctv .p-bar { fill: rgba(255, 255, 255, 0.05); }
.ctv .p-dot { fill: var(--lamp-off); }
.ctv .p-label { fill: var(--screen-text); font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.06em; }
.ctv .p-line { fill: rgba(219, 229, 216, 0.28); }
.ctv .p-line.dim { fill: rgba(219, 229, 216, 0.14); }
.ctv .lamp { fill: var(--lamp-ok); }
.ctv .beam { fill: none; stroke: var(--sync); stroke-width: 1.4; stroke-dasharray: 5 9; opacity: 0.55; }
.ctv .pkt rect { fill: var(--screen); stroke: var(--sync); stroke-width: 1; }
.ctv .pkt text { fill: var(--sync); font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.08em; }
.ctv .pkt { display: none; }
.ctv .doc-face { fill: var(--screen); stroke: var(--line-strong); stroke-width: 1.2; }
.ctv .doc-label { fill: var(--screen-text); font-family: var(--font-mono); font-size: 15px; font-weight: 600; letter-spacing: 0.02em; }
.ctv .chip { fill: #f55300; }
.ctv .chip-glyph { fill: none; stroke: #1c0b02; stroke-width: 1.6; stroke-linejoin: round; }
.ctv .tray-top { fill: var(--face); stroke: var(--line-strong); stroke-width: 1; }
.ctv .tray-front { fill: var(--well); stroke: var(--line-strong); stroke-width: 1; }
.ctv .glow { fill: var(--accent); opacity: 0.09; }
.ctv .shadow { fill: rgba(0, 0, 0, 0.3); }

@supports (offset-path: path("M0 0 L1 1")) {
  .ctv .pkt { display: initial; }
}

@media (prefers-reduced-motion: no-preference) {
  .ctv .float-a { animation: ctv-float 6.5s ease-in-out infinite; }
  .ctv .float-b { animation: ctv-float 7.5s ease-in-out -2.2s infinite; }
  .ctv .float-c { animation: ctv-float 8.5s ease-in-out -4.4s infinite; }
  .ctv .float-doc { animation: ctv-float-doc 5.5s ease-in-out infinite; }
  .ctv .glow { animation: ctv-glow 5.5s ease-in-out infinite; }
  .ctv .shadow { animation: ctv-shadow 5.5s ease-in-out infinite; transform-origin: 272px 306px; }
  .ctv .beam { animation: ctv-flow 1.6s linear infinite; }
  .ctv .lamp { animation: ctv-blink 4.5s steps(1) infinite; }
  .ctv .lamp.l2 { animation-delay: -1.5s; }
  .ctv .lamp.l3 { animation-delay: -3s; }
  .ctv .pkt { offset-rotate: 0deg; animation: ctv-travel 4.5s ease-in-out infinite; }
  .ctv .pkt.d1 { offset-path: path("M178 165 C 226 165 232 198 254 206"); }
  .ctv .pkt.d2 { offset-path: path("M296 186 C 328 148 340 100 378 84"); animation-delay: -1.5s; }
  .ctv .pkt.d3 { offset-path: path("M298 226 C 334 250 346 296 384 316"); animation-delay: -3s; }
}

@keyframes ctv-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes ctv-float-doc { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes ctv-glow { 0%, 100% { opacity: 0.09; } 50% { opacity: 0.17; } }
@keyframes ctv-shadow { 0%, 100% { transform: scaleX(1); opacity: 0.3; } 50% { transform: scaleX(0.86); opacity: 0.2; } }
@keyframes ctv-flow { to { stroke-dashoffset: -14; } }
@keyframes ctv-blink { 0%, 88% { fill: var(--lamp-ok); } 92%, 96% { fill: var(--lamp-off); } 100% { fill: var(--lamp-ok); } }
@keyframes ctv-travel {
  0% { offset-distance: 0%; opacity: 0; }
  12% { opacity: 1; }
  82% { opacity: 1; }
  96%, 100% { offset-distance: 100%; opacity: 0; }
}
`;

function Panel({
  x,
  y,
  w,
  h,
  label,
  lampClass,
  lines,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  lampClass: string;
  lines: Array<[number, number, boolean]>;
}) {
  return (
    <g>
      <rect className="p" x={x} y={y} width={w} height={h} rx={10} />
      <rect className="p-bar" x={x + 1} y={y + 1} width={w - 2} height={22} rx={9} />
      <circle className="p-dot" cx={x + 13} cy={y + 12} r={2.4} />
      <circle className="p-dot" cx={x + 23} cy={y + 12} r={2.4} />
      <circle className="p-dot" cx={x + 33} cy={y + 12} r={2.4} />
      <text className="p-label" x={x + 46} y={y + 16}>
        {label}
      </text>
      <circle className={`lamp ${lampClass}`} cx={x + w - 13} cy={y + 12} r={3} />
      {lines.map(([lx, lw, dim], i) => (
        <rect
          key={i}
          className={`p-line${dim ? " dim" : ""}`}
          x={x + 14 + lx}
          y={y + 36 + i * 13}
          width={lw}
          height={4}
          rx={2}
        />
      ))}
    </g>
  );
}

export function ContextTravel() {
  return (
    <div aria-label="Diagram: one .ctxfile carrying project context between Claude Code, Cursor, and ChatGPT">
      <style>{STYLE}</style>
      <svg className="ctv" viewBox="0 0 560 400" role="img" aria-hidden="true">
        {/* beams: agents to the file and back out */}
        <path className="beam" d="M178 165 C 226 165 232 198 254 206" />
        <path className="beam" d="M296 186 C 328 148 340 100 378 84" />
        <path className="beam" d="M298 226 C 334 250 346 296 384 316" />

        {/* agent windows, floating at different depths */}
        <g className="float-a">
          <Panel
            x={8}
            y={92}
            w={170}
            h={146}
            label="claude code"
            lampClass="l1"
            lines={[
              [0, 96, false],
              [0, 128, true],
              [12, 104, false],
              [12, 82, true],
              [0, 118, true],
              [0, 70, false],
              [12, 96, true],
            ]}
          />
        </g>
        <g className="float-b">
          <Panel
            x={380}
            y={26}
            w={172}
            h={112}
            label="cursor"
            lampClass="l2"
            lines={[
              [0, 110, false],
              [0, 84, true],
              [12, 118, true],
              [0, 66, false],
              [12, 92, true],
            ]}
          />
        </g>
        <g className="float-c">
          <Panel
            x={386}
            y={280}
            w={166}
            h={112}
            label="chatgpt"
            lampClass="l3"
            lines={[
              [0, 102, false],
              [0, 122, true],
              [12, 84, true],
              [0, 110, false],
              [12, 70, true],
            ]}
          />
        </g>

        {/* the case: shadow, glow, tray, standing .ctxfile document */}
        <ellipse className="shadow" cx={272} cy={306} rx={64} ry={10} />
        <ellipse className="glow" cx={272} cy={210} rx={72} ry={52} />
        <g>
          <polygon className="tray-top" points="212,286 332,286 356,268 236,268" />
          <rect className="tray-front" x={212} y={286} width={120} height={12} rx={3} />
        </g>
        <g className="float-doc">
          {/* document with folded corner */}
          <path className="doc-face" d="M232 132 h58 l22 22 v112 h-80 z" />
          <path className="doc-face" d="M290 132 v22 h22 z" />
          {/* chip logo (mirrors the brand mark) */}
          <rect className="chip" x={248} y={152} width={24} height={24} rx={6} />
          <path className="chip-glyph" d="M255 158.5 h6 l3 3 v9 h-9 z" />
          <circle cx={259.5} cy={166} r={1.7} fill="#1c0b02" />
          <text className="doc-label" x={244} y={216}>
            .ctxfile
          </text>
          {/* payload rows inside the doc */}
          <rect className="p-line" x={244} y={230} width={62} height={4} rx={2} />
          <rect className="p-line dim" x={244} y={241} width={48} height={4} rx={2} />
          <rect className="p-line dim" x={244} y={252} width={56} height={4} rx={2} />
        </g>

        {/* traveling context packets (hidden without offset-path support) */}
        <g className="pkt d1">
          <rect x={-19} y={-9} width={38} height={18} rx={5} />
          <text x={-13} y={3.5}>plan</text>
        </g>
        <g className="pkt d2">
          <rect x={-19} y={-9} width={38} height={18} rx={5} />
          <text x={-14.5} y={3.5}>git</text>
        </g>
        <g className="pkt d3">
          <rect x={-22} y={-9} width={44} height={18} rx={5} />
          <text x={-16} y={3.5}>sess</text>
        </g>
      </svg>
    </div>
  );
}

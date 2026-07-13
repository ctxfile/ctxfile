/**
 * Hero scene, glass edition: an open glass case with a .ctxfile document
 * rising out of it (glowing context mesh inside), and five agent windows
 * floating around it. Context packets travel the beams between them.
 *
 * Pure SVG + CSS, zero JS. Motion is gated behind prefers-reduced-motion and
 * @supports(offset-path) so it degrades to a clean still. Every color is a
 * component-scoped CSS var with a [data-theme="light"] override, so the scene
 * reads correctly in both themes. Agent marks are simplified renderings of
 * each brand's logo, used nominatively ("works with").
 */

const STYLE = `
.ctv {
  display: block; width: 100%; height: auto;
  --g-stroke: rgba(126, 216, 244, 0.65);
  --g-fill: rgba(120, 212, 244, 0.10);
  --g-sheen: rgba(255, 255, 255, 0.28);
  --g-glow: #4ec4e6;
  --w-fill: rgba(14, 21, 30, 0.78);
  --w-bar: rgba(255, 255, 255, 0.05);
  --w-stroke: rgba(140, 205, 235, 0.32);
  --w-text: #d9e7f0;
  --w-line: rgba(217, 231, 240, 0.30);
  --w-dot: rgba(217, 231, 240, 0.25);
  --doc-text: #eefaff;
  --mesh: rgba(126, 224, 250, 0.85);
  --shadow: rgba(2, 12, 20, 0.45);
  --pkt-fill: rgba(10, 24, 33, 0.85);
}
:root[data-theme="light"] .ctv {
  --g-stroke: rgba(13, 127, 166, 0.55);
  --g-fill: rgba(13, 127, 166, 0.08);
  --g-sheen: rgba(255, 255, 255, 0.85);
  --g-glow: #0d7fa6;
  --w-fill: rgba(255, 255, 255, 0.82);
  --w-bar: rgba(13, 127, 166, 0.06);
  --w-stroke: rgba(13, 127, 166, 0.30);
  --w-text: #1d3b4a;
  --w-line: rgba(29, 59, 74, 0.28);
  --w-dot: rgba(29, 59, 74, 0.22);
  --doc-text: #0b3547;
  --mesh: rgba(11, 116, 152, 0.75);
  --shadow: rgba(13, 60, 80, 0.18);
  --pkt-fill: rgba(255, 255, 255, 0.9);
}

.ctv .win { fill: var(--w-fill); stroke: var(--w-stroke); stroke-width: 1; }
.ctv .win-bar { fill: var(--w-bar); }
.ctv .win-dot { fill: var(--w-dot); }
.ctv .win-label { fill: var(--w-text); font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.05em; }
.ctv .ln { fill: var(--w-line); }
.ctv .ln.dim { opacity: 0.5; }
.ctv .ln.red { fill: #ef8f8f; }
.ctv .ln.teal { fill: #5fc9b2; }
.ctv .beam { fill: none; stroke: var(--g-glow); stroke-width: 1.3; stroke-dasharray: 4 8; opacity: 0.5; }
.ctv .joint { fill: var(--g-glow); opacity: 0.9; }
.ctv .glass { fill: var(--g-fill); stroke: var(--g-stroke); stroke-width: 1.3; }
.ctv .sheen { fill: var(--g-sheen); }
.ctv .doc-label { fill: var(--doc-text); font-family: var(--font-mono); font-size: 15px; font-weight: 600; }
.ctv .mesh { fill: none; stroke: var(--mesh); stroke-width: 0.9; }
.ctv .mesh-node { fill: var(--mesh); }
.ctv .halo { fill: var(--g-glow); opacity: 0.10; }
.ctv .shadow { fill: var(--shadow); }
.ctv .pkt rect { fill: var(--pkt-fill); stroke: var(--g-glow); stroke-width: 1; }
.ctv .pkt text { fill: var(--g-glow); font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.08em; }
.ctv .pkt { display: none; }

@supports (offset-path: path("M0 0 L1 1")) {
  .ctv .pkt { display: initial; }
}

@media (prefers-reduced-motion: no-preference) {
  .ctv .float-a { animation: ctv-float 7s ease-in-out infinite; }
  .ctv .float-b { animation: ctv-float 8s ease-in-out -2.6s infinite; }
  .ctv .float-c { animation: ctv-float 7.6s ease-in-out -5s infinite; }
  .ctv .float-d { animation: ctv-float 8.4s ease-in-out -1.4s infinite; }
  .ctv .float-e { animation: ctv-float 7.2s ease-in-out -3.8s infinite; }
  .ctv .float-doc { animation: ctv-float-doc 6s ease-in-out infinite; }
  .ctv .halo { animation: ctv-halo 6s ease-in-out infinite; }
  .ctv .shadow { animation: ctv-shadow 6s ease-in-out infinite; transform-origin: 272px 320px; }
  .ctv .beam { animation: ctv-flow 1.7s linear infinite; }
  .ctv .mesh.spin { animation: ctv-mesh 9s linear infinite; }
  .ctv .pkt { offset-rotate: 0deg; animation: ctv-travel 4.8s ease-in-out infinite; }
  .ctv .pkt.d1 { offset-path: path("M192 176 C 222 176 226 190 236 196"); }
  .ctv .pkt.d2 { offset-path: path("M308 182 C 340 158 356 118 392 96"); animation-delay: -1s; }
  .ctv .pkt.d3 { offset-path: path("M318 236 C 350 228 368 214 398 204"); animation-delay: -2s; }
  .ctv .pkt.d4 { offset-path: path("M120 314 C 154 306 184 290 214 278"); animation-delay: -3s; }
  .ctv .pkt.d5 { offset-path: path("M316 288 C 350 304 366 324 400 340"); animation-delay: -3.9s; }
}

@keyframes ctv-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes ctv-float-doc { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-11px); } }
@keyframes ctv-halo { 0%, 100% { opacity: 0.10; } 50% { opacity: 0.2; } }
@keyframes ctv-shadow { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(0.85); } }
@keyframes ctv-flow { to { stroke-dashoffset: -12; } }
@keyframes ctv-mesh { to { stroke-dashoffset: -60; } }
@keyframes ctv-travel {
  0% { offset-distance: 0%; opacity: 0; }
  12% { opacity: 1; }
  82% { opacity: 1; }
  96%, 100% { offset-distance: 100%; opacity: 0; }
}
`;

/* ---- simplified brand marks (nominative use: "works with") ---- */

function ClaudeMark({ x, y }: { x: number; y: number }) {
  // Anthropic's spark: tapered rays around a center.
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <g transform={`translate(${x} ${y})`}>
      {rays.map((r) => (
        <path key={r} d="M0 -6.4 L1.5 -1.5 L0 0 L-1.5 -1.5 Z" fill="#d97757" transform={`rotate(${r})`} />
      ))}
    </g>
  );
}

function CursorMark({ x, y }: { x: number; y: number }) {
  // Cursor's faceted cube.
  return (
    <g transform={`translate(${x} ${y})`} stroke="var(--w-text)" strokeWidth={1.1} fill="none">
      <path d="M0 -6 L5.2 -3 V3 L0 6 L-5.2 3 V-3 Z" />
      <path d="M-5.2 -3 L0 0 L5.2 -3 M0 0 V6" />
    </g>
  );
}

function OpenAIMark({ x, y }: { x: number; y: number }) {
  // The hexagonal knot, six rotated arms.
  const arms = Array.from({ length: 6 }, (_, i) => i * 60);
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke="var(--w-text)" strokeWidth={1.2}>
      {arms.map((r) => (
        <path key={r} d="M0 -6.2 A 6.2 6.2 0 0 1 5.37 -3.1 L 2.55 -1.47 A 2.95 2.95 0 0 0 0 -2.95 Z" transform={`rotate(${r})`} />
      ))}
    </g>
  );
}

function GeminiMark({ x, y }: { x: number; y: number }) {
  // Gemini's four-point spark with the blue-violet sweep.
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M0 -6.6 C 0.8 -2.2 2.2 -0.8 6.6 0 C 2.2 0.8 0.8 2.2 0 6.6 C -0.8 2.2 -2.2 0.8 -6.6 0 C -2.2 -0.8 -0.8 -2.2 0 -6.6 Z"
        fill="url(#ctv-gem)"
      />
    </g>
  );
}

function GrokMark({ x, y }: { x: number; y: number }) {
  // Grok/xAI's slash mark.
  return (
    <g transform={`translate(${x} ${y})`} stroke="var(--w-text)" strokeWidth={1.6} strokeLinecap="round">
      <path d="M3.6 -5.6 L-3.6 5.6" />
      <path d="M-3.6 -5.6 L-0.6 -1.2" />
      <path d="M3.6 5.6 L0.6 1.2" />
    </g>
  );
}

/* ---- glass agent window ---- */

function Win({
  x,
  y,
  w,
  h,
  label,
  mark,
  lines,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  mark: (p: { x: number; y: number }) => React.ReactNode;
  lines: Array<[number, number, string?]>;
}) {
  return (
    <g>
      <rect className="win" x={x} y={y} width={w} height={h} rx={11} />
      <rect className="win-bar" x={x + 1} y={y + 1} width={w - 2} height={21} rx={10} />
      <circle className="win-dot" cx={x + 12} cy={y + 11.5} r={2.2} />
      <circle className="win-dot" cx={x + 21} cy={y + 11.5} r={2.2} />
      <circle className="win-dot" cx={x + 30} cy={y + 11.5} r={2.2} />
      {mark({ x: x + 47, y: y + 11.5 })}
      <text className="win-label" x={x + 58} y={y + 15}>
        {label}
      </text>
      {lines.map(([lx, lw, tone], i) => (
        <rect
          key={i}
          className={`ln${tone ? ` ${tone}` : ""}`}
          x={x + 13 + lx}
          y={y + 33 + i * 12}
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
    <div aria-label="Diagram: a glass case with a .ctxfile document carrying project context between Claude, Cursor, ChatGPT, Gemini, and Grok">
      <style>{STYLE}</style>
      <svg className="ctv" viewBox="0 0 560 420" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="ctv-gem" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4796e3" />
            <stop offset="0.55" stopColor="#9177c7" />
            <stop offset="1" stopColor="#d3646f" />
          </linearGradient>
          <linearGradient id="ctv-doc" x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="var(--g-sheen)" />
            <stop offset="0.35" stopColor="var(--g-fill)" />
            <stop offset="1" stopColor="var(--g-fill)" />
          </linearGradient>
          <filter id="ctv-blur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* beams with glowing joints */}
        <g>
          <path className="beam" d="M192 176 C 222 176 226 190 236 196" />
          <path className="beam" d="M308 182 C 340 158 356 118 392 96" />
          <path className="beam" d="M318 236 C 350 228 368 214 398 204" />
          <path className="beam" d="M120 314 C 154 306 184 290 214 278" />
          <path className="beam" d="M316 288 C 350 304 366 324 400 340" />
          {[
            [192, 176],
            [392, 96],
            [398, 204],
            [120, 314],
            [400, 340],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} className="joint" cx={cx} cy={cy} r={2.2} />
          ))}
        </g>

        {/* the case: halo, shadow, open lid, tray, mesh, rising document */}
        <ellipse className="shadow" cx={272} cy={320} rx={70} ry={9} filter="url(#ctv-blur)" />
        <ellipse className="halo" cx={272} cy={230} rx={80} ry={62} filter="url(#ctv-blur)" />

        {/* open lid: tilted glass frame behind the document */}
        <g transform="rotate(12 344 186)" opacity={0.75}>
          <rect className="glass" x={300} y={140} width={90} height={94} rx={14} />
          <rect className="glass" x={308} y={148} width={74} height={78} rx={10} opacity={0.45} />
        </g>

        {/* tray: rim + cavity + front wall */}
        <path
          className="glass"
          d="M196 296 L 348 296 Q 356 296 353 290 L 334 264 Q 331 259 323 259 L 221 259 Q 213 259 210 264 L 191 290 Q 188 296 196 296 Z"
        />
        <path
          className="glass"
          d="M196 296 L 348 296 Q 356 296 356 302 L 356 306 Q 356 314 346 314 L 198 314 Q 188 314 188 306 L 188 302 Q 188 296 196 296 Z"
          opacity={0.8}
        />
        {/* context mesh glowing inside the cavity */}
        <g className="mesh-wrap">
          {[
            [14, 5],
            [24, 9],
            [34, 12.5],
            [44, 16],
          ].map(([rx, ry], i) => (
            <ellipse
              key={rx}
              className="mesh spin"
              cx={272}
              cy={281}
              rx={rx}
              ry={ry}
              strokeDasharray={i % 2 ? "5 4" : "8 5"}
              opacity={0.85 - i * 0.14}
            />
          ))}
          {[
            [258, 274],
            [287, 277],
            [271, 288],
            [246, 283],
            [298, 286],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} className="mesh-node" cx={cx} cy={cy} r={1.6} />
          ))}
        </g>

        {/* the .ctxfile document rising out of the case */}
        <g className="float-doc">
          <g transform="rotate(-4 274 198)">
            <path
              d="M232 150 Q232 138 244 138 L 286 138 L 316 168 L 316 246 Q 316 258 304 258 L 244 258 Q 232 258 232 246 Z"
              fill="url(#ctv-doc)"
              stroke="var(--g-stroke)"
              strokeWidth={1.4}
            />
            {/* folded corner */}
            <path d="M286 138 L 316 168 L 298 168 Q 286 168 286 156 Z" className="glass" />
            {/* sheen sweep */}
            <path d="M240 146 L 260 142 L 246 208 L 237 204 Z" className="sheen" opacity={0.35} />
            <text className="doc-label" x={243} y={206}>
              .ctxfile
            </text>
            <rect className="ln" x={243} y={220} width={56} height={4} rx={2} />
            <rect className="ln dim" x={243} y={231} width={42} height={4} rx={2} />
          </g>
        </g>

        {/* mini context chips sitting in the tray, in front of the document */}
        <g>
          <rect className="glass" x={218} y={262} width={26} height={19} rx={5} />
          <circle className="mesh-node" cx={226} cy={271.5} r={1.4} />
          <circle className="mesh-node" cx={231} cy={271.5} r={1.4} />
          <circle className="mesh-node" cx={236} cy={271.5} r={1.4} />
          <rect className="glass" x={312} y={260} width={26} height={19} rx={5} />
          <rect className="mesh-node" x={318} y={268} width={3} height={6} rx={1} />
          <rect className="mesh-node" x={323} y={265} width={3} height={9} rx={1} />
          <rect className="mesh-node" x={328} y={270} width={3} height={4} rx={1} />
        </g>

        {/* agent windows */}
        <g className="float-a">
          <Win
            x={8}
            y={98}
            w={184}
            h={158}
            label="claude"
            mark={ClaudeMark}
            lines={[
              [0, 104],
              [0, 132, "dim"],
              [10, 58, "red"],
              [10, 96, "teal"],
              [0, 120, "dim"],
              [10, 72, "red"],
              [10, 88, "teal"],
              [0, 64, "dim"],
              [0, 108],
            ]}
          />
        </g>
        <g className="float-b">
          <Win
            x={392}
            y={22}
            w={158}
            h={92}
            label="cursor"
            mark={CursorMark}
            lines={[
              [0, 104],
              [0, 78, "dim"],
              [10, 112, "dim"],
              [0, 60],
            ]}
          />
        </g>
        <g className="float-c">
          <Win
            x={398}
            y={148}
            w={154}
            h={98}
            label="chatgpt"
            mark={OpenAIMark}
            lines={[
              [0, 96],
              [0, 116, "dim"],
              [10, 78, "dim"],
              [0, 104],
              [10, 64, "dim"],
            ]}
          />
        </g>
        <g className="float-d">
          <Win
            x={30}
            y={306}
            w={152}
            h={90}
            label="gemini"
            mark={GeminiMark}
            lines={[
              [0, 96],
              [0, 118, "dim"],
              [10, 72, "dim"],
              [0, 88],
            ]}
          />
        </g>
        <g className="float-e">
          <Win
            x={400}
            y={302}
            w={150}
            h={88}
            label="grok"
            mark={GrokMark}
            lines={[
              [0, 92],
              [0, 112, "dim"],
              [10, 68, "dim"],
              [0, 84],
            ]}
          />
        </g>

        {/* traveling context packets */}
        <g className="pkt d1">
          <rect x={-19} y={-9} width={38} height={18} rx={5} />
          <text x={-13} y={3.5}>plan</text>
        </g>
        <g className="pkt d2">
          <rect x={-16} y={-9} width={32} height={18} rx={5} />
          <text x={-9} y={3.5}>git</text>
        </g>
        <g className="pkt d3">
          <rect x={-20} y={-9} width={40} height={18} rx={5} />
          <text x={-14} y={3.5}>sess</text>
        </g>
        <g className="pkt d4">
          <rect x={-21} y={-9} width={42} height={18} rx={5} />
          <text x={-15} y={3.5}>files</text>
        </g>
        <g className="pkt d5">
          <rect x={-18} y={-9} width={36} height={18} rx={5} />
          <text x={-12} y={3.5}>mem</text>
        </g>
      </svg>
    </div>
  );
}

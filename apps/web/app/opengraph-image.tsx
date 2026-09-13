import { ImageResponse } from "next/og";

// Render once at build time so the route is compatible with `output: export`.
export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ctxfile: one context, every agent, all local.";

const CHIPS = ["Claude Code", "Cursor", "Codex", "Gemini CLI", "any MCP client"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          backgroundColor: "#09090b",
          backgroundImage:
            "radial-gradient(700px 420px at 12% -10%, rgba(255,87,20,0.28), transparent 65%), radial-gradient(600px 400px at 95% 10%, rgba(78,196,230,0.18), transparent 65%), radial-gradient(700px 500px at 60% 120%, rgba(184,146,255,0.14), transparent 65%)",
          color: "#f2f1ed",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              display: "flex",
              width: 76,
              height: 76,
              borderRadius: 18,
              backgroundColor: "#f55300",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 30px rgba(245,83,0,0.35)",
            }}
          >
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <path d="M11 8.5h7l3.5 3.5v11.5h-10.5z" stroke="#1c0b02" strokeWidth="2" strokeLinejoin="round" />
              <path d="M18 8.5v3.5h3.5" stroke="#1c0b02" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="16" cy="18" r="2.1" fill="#1c0b02" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: "-1.5px" }}>ctxfile</div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 80,
            fontWeight: 800,
            letterSpacing: "-3.5px",
            lineHeight: 1.02,
            marginTop: 44,
            maxWidth: 1000,
          }}
        >
          Stop re-explaining your project to every AI agent.
        </div>

        <div style={{ display: "flex", fontSize: 28, color: "#a5a49d", marginTop: 26, letterSpacing: "-0.3px" }}>
          One context file, versioned in your repo. Local-first. Open source.
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 44 }}>
          {CHIPS.map((c) => (
            <div
              key={c}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 18px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                backgroundColor: "rgba(255,255,255,0.05)",
                fontSize: 20,
                color: "#d6d5cf",
              }}
            >
              <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, backgroundColor: "#2ee27b" }} />
              {c}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}

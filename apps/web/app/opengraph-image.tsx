import { ImageResponse } from "next/og";

// Render once at build time so the route is compatible with `output: export`.
export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ctxfile: one context, every agent, all local.";

/** Segmented LED meter, 40 cells, ~37% lit green. */
function MeterCells() {
  const cells = [];
  for (let i = 0; i < 40; i++) {
    cells.push(
      <div
        key={i}
        style={{
          display: "flex",
          width: 12,
          height: 16,
          borderRadius: 2,
          backgroundColor: i < 15 ? "#2ee27b" : "#1d211e",
        }}
      />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        gap: 5,
        padding: 10,
        borderRadius: 8,
        backgroundColor: "#0c0e0d",
        border: "1px solid #000000",
      }}
    >
      {cells}
    </div>
  );
}

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
          backgroundColor: "#151513",
          color: "#ece9e1",
          fontFamily: "monospace",
        }}
      >
        {/* Brand mark: orange plate with a recorded file. */}
        <div
          style={{
            display: "flex",
            width: 88,
            height: 88,
            borderRadius: 20,
            backgroundColor: "#f55300",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="56" height="56" viewBox="0 0 32 32" fill="none">
            <path
              d="M11 8.5h7l3.5 3.5v11.5h-10.5z"
              stroke="#1c0b02"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M18 8.5v3.5h3.5" stroke="#1c0b02" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="16" cy="18" r="2.1" fill="#1c0b02" />
          </svg>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 88,
            fontWeight: 700,
            letterSpacing: "-4px",
            marginTop: 30,
          }}
        >
          ctxfile
        </div>
        <div style={{ display: "flex", fontSize: 33, color: "#a6a396", marginTop: 16 }}>
          One context, every agent, all local.
        </div>
        <div style={{ display: "flex", marginTop: 58 }}>
          <MeterCells />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: 700,
            marginTop: 16,
            fontSize: 20,
            color: "#767263",
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          <div style={{ display: "flex" }}>token budget</div>
          <div style={{ display: "flex", color: "#ff5714" }}>18,432 / 50,000</div>
        </div>
      </div>
    ),
    size
  );
}

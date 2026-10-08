import { ImageResponse } from "next/og";

export const alt = "Moltenship Time — the React calendar built on Temporal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const brand = "#f54a00";
// Weekday columns of [start row, rows, accent] on a 10-row grid, echoing the landing preview.
const blocks = [
  [
    [1, 1, false],
    [3, 3, true],
  ],
  [
    [1, 1, false],
    [2, 5, false],
  ],
  [
    [1, 1, false],
    [3, 2, true],
    [7, 3, true],
  ],
  [
    [1, 1, false],
    [6, 2, true],
  ],
  [
    [1, 1, false],
    [5, 2, true],
    [7, 1, false],
  ],
] as const;

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#0a0a0a",
        color: "#fafafa",
        padding: 72,
        gap: 64,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30 }}>
          <svg height="48" viewBox="0 0 32 32" width="48">
            <rect fill={brand} height="32" rx="8" width="32" />
            <path
              d="M12.5 8v16M19.5 8v16"
              stroke="#fff"
              strokeLinecap="round"
              strokeOpacity="0.45"
              strokeWidth="1.5"
            />
            <circle cx="8.5" cy="17" fill="#fff" r="2.5" />
            <path d="M10 17h14" stroke="#fff" strokeLinecap="round" strokeWidth="2" />
          </svg>
          Moltenship Time
        </div>
        <div
          style={{
            marginTop: "auto",
            fontSize: 68,
            fontWeight: 600,
            letterSpacing: -2,
            lineHeight: 1.05,
          }}
        >
          The React calendar built on Temporal
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: "#a3a3a3" }}>
          Exact time zones and DST. Views you own.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          width: 380,
          border: "1px solid #262626",
          borderRadius: 20,
          padding: 16,
          gap: 8,
          background: "#141414",
        }}
      >
        {blocks.map((day, index) => (
          <div key={index} style={{ display: "flex", position: "relative", flex: 1 }}>
            {day.map(([start, length, accent]) => (
              <div
                key={start}
                style={{
                  position: "absolute",
                  top: `${start * 10}%`,
                  height: `${length * 10 - 1.5}%`,
                  left: 0,
                  right: 0,
                  borderRadius: 6,
                  borderLeft: `4px solid ${accent ? brand : "#525252"}`,
                  background: accent ? "rgba(245, 74, 0, 0.22)" : "#262626",
                }}
              />
            ))}
            {index === 3 ? (
              <div
                style={{
                  position: "absolute",
                  top: "34%",
                  left: -4,
                  right: -4,
                  height: 3,
                  background: brand,
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}

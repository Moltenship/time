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
        <svg
          fill="none"
          height="52"
          stroke="#fafafa"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          viewBox="-2 1 58 24"
          width="126"
        >
          <path d="M4 5V18a4 4 0 0 0 4 4h1.5M0.5 10.5H9" />
          <path d="M15 10.5V22" />
          <path d="M21 10.5V22M21 14.75a4 4 0 0 1 8 0V22M29 14.75a4 4 0 0 1 8 0V22" />
          <path d="M41.75 16.25H53.25A5.75 5.75 0 1 0 51.6 20.3" />
          <circle cx="15" cy="4.6" fill={brand} r="2.2" stroke="none" />
        </svg>
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

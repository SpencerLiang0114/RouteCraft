"use client";

import type { ElevationPoint } from "@/types/route";

const W = 600;
const H = 130;
const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function ticks(min: number, max: number, count: number): number[] {
  const range = max - min || 1;
  const raw = range / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.ceil(raw / magnitude) * magnitude;
  const start = Math.floor(min / step) * step;
  const result: number[] = [];

  for (let v = start; v <= max + step * 0.5; v += step) {
    result.push(Math.round(v));
  }

  return result;
}

export function ElevationChart({ profile }: { profile: ElevationPoint[] }) {
  if (profile.length < 2) return null;

  const maxDist = profile[profile.length - 1].distanceKm;
  const elevations = profile.map((p) => p.elevM);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const elevRange = maxElev - minElev || 1;

  function x(d: number) {
    return PAD.left + (d / maxDist) * INNER_W;
  }

  function y(e: number) {
    return PAD.top + INNER_H - ((e - minElev) / elevRange) * INNER_H;
  }

  const yTicks = ticks(minElev, maxElev, 4);

  const xLabelCount = Math.min(Math.ceil(maxDist) + 1, 8);
  const xStep = maxDist / (xLabelCount - 1);
  const xLabels = Array.from({ length: xLabelCount }, (_, i) =>
    Math.round(i * xStep * 10) / 10,
  );

  // Build a smooth cubic bezier path: control points sit at the horizontal midpoint
  // between adjacent profile points, producing S-shaped transitions with no kinks.
  function smoothLinePath(pts: ElevationPoint[]): string {
    if (pts.length < 2) return "";
    let d = `M ${x(pts[0].distanceKm)} ${y(pts[0].elevM)}`;
    for (let i = 1; i < pts.length; i++) {
      const x0 = x(pts[i - 1].distanceKm);
      const y0 = y(pts[i - 1].elevM);
      const x1 = x(pts[i].distanceKm);
      const y1 = y(pts[i].elevM);
      const mx = (x0 + x1) / 2;
      d += ` C ${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
    }
    return d;
  }

  const linePath = smoothLinePath(profile);
  const areaPath = `${linePath} L ${x(maxDist)} ${y(minElev)} L ${x(0)} ${y(minElev)} Z`;

  return (
    <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-stone-700">Elevation profile</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 160 }}
        aria-label="Elevation profile chart"
      >
        {yTicks.map((tick) => {
          const yPos = y(tick);
          if (yPos < PAD.top - 4 || yPos > PAD.top + INNER_H + 4) return null;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + INNER_W}
                y1={yPos}
                y2={yPos}
                stroke="#d6d3d1"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={PAD.left - 6}
                y={yPos + 4}
                textAnchor="end"
                fontSize={11}
                fill="#78716c"
              >
                {tick} m
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="#9ca3af" opacity={0.8} />

        {xLabels.map((d) => (
          <text
            key={d}
            x={x(d)}
            y={PAD.top + INNER_H + 17}
            textAnchor="middle"
            fontSize={11}
            fill="#78716c"
          >
            {d} km
          </text>
        ))}
      </svg>
    </div>
  );
}

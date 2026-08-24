import { useMemo, useState } from "react";
import { useAppState } from "../store";

import "./TrafficAnalytics.css";

const W = 560;
const H = 160;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

function buildPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  // Smooth curve: quadratic-bezier through the midpoint of each segment,
  // using the real point as the control point. Avoids the jagged
  // straight-line-between-random-points look on noisy live data.
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    d += ` Q ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

export function TrafficAnalytics() {
  const state = useAppState();
  const traffic = state.traffic;
  const connected = state.connection === "connected";
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { points, ticks } = useMemo(() => {
    const data = traffic.slice(-60);
    const max = Math.max(100, ...data.map((d) => d.requestsPerSec));
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const pts = data.map((d, i) => ({
      x: PAD.left + (i / Math.max(1, data.length - 1)) * innerW,
      y: PAD.top + innerH - (d.requestsPerSec / max) * innerH,
      value: d.requestsPerSec,
      time: d.timestamp,
    }));
    const tickCount = 5;
    const t = Array.from({ length: tickCount }, (_, i) => {
      const v = Math.round((max / (tickCount - 1)) * i);
      return { v, y: PAD.top + innerH - (v / max) * innerH };
    });
    return { points: pts, ticks: t };
  }, [traffic]);

  const path = buildPath(points);
  const areaPath =
    points.length > 1
      ? `${path} L ${points[points.length - 1].x.toFixed(1)} ${H - PAD.bottom} L ${points[0].x.toFixed(1)} ${H - PAD.bottom} Z`
      : "";

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="traffic-panel">
      <div className="traffic-chart-wrap">
        {!connected && (
          <div className="traffic-overlay" role="status">
            <span className="status-text">OFFLINE — DATA STALE</span>
          </div>
        )}
        {connected && points.length === 0 && (
          <div className="traffic-overlay" role="status">
            <span className="status-text">WAITING FOR TRAFFIC DATA</span>
          </div>
        )}
        <svg
          className="traffic-chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Live network traffic chart"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(e) => {
            if (points.length === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const scaleX = W / rect.width;
            const mx = (e.clientX - rect.left) * scaleX;
            let best = 0;
            let bestDist = Infinity;
            points.forEach((p, i) => {
              const d = Math.abs(p.x - mx);
              if (d < bestDist) {
                bestDist = d;
                best = i;
              }
            });
            setHoverIndex(best);
          }}
        >
          {/* Grid + y-axis labels */}
          {ticks.map((t) => (
            <g key={t.v}>
              <line className="chart-grid" x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} />
              <text className="chart-axis" x={PAD.left - 6} y={t.y + 3} textAnchor="end">
                {t.v}
              </text>
            </g>
          ))}

          {/* Area + line */}
          {areaPath && <path className="chart-area" d={areaPath} />}
          {path && <path className="chart-line" d={path} />}

          {/* Hover crosshair */}
          {hovered && (
            <g>
              <line
                className="chart-crosshair"
                x1={hovered.x}
                y1={PAD.top}
                x2={hovered.x}
                y2={H - PAD.bottom}
              />
              <circle className="chart-hover-dot" cx={hovered.x} cy={hovered.y} r="4" />
            </g>
          )}

          {/* X-axis time labels */}
          {points.length > 0 && (
            <>
              <text className="chart-axis" x={PAD.left} y={H - 6} textAnchor="start">
                {points[0].time}
              </text>
              <text className="chart-axis" x={W - PAD.right} y={H - 6} textAnchor="end">
                {points[points.length - 1].time}
              </text>
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            className="chart-tooltip"
            style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / H) * 100}%` }}
            role="status"
          >
            <span className="tooltip-time">{hovered.time}</span>
            <span className="tooltip-value">{hovered.value} req/s</span>
          </div>
        )}
      </div>

      <div className="traffic-meta">
        <span className="label-mono">Requests/sec</span>
        <span className="traffic-current">
          {connected && points.length > 0 ? `${points[points.length - 1].value} req/s` : "—"}
        </span>
      </div>
    </div>
  );
}
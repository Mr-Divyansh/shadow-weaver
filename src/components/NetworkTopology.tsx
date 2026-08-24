import { useAppState } from "../store";
import { ENTITY_LABELS } from "../types";

import "./NetworkTopology.css";

// Simple, readable SVG topology:
//   Red Team ──▶ Blue Team
//   Red Team ──▶ Honeypot

const NODE_W = 140;
const NODE_H = 64;
const GAP = 60;

const RED = { x: 40, y: 20 };
const BLUE = { x: 40 + NODE_W + GAP, y: 20 };
const HONEY = { x: 40 + NODE_W + GAP, y: 20 + NODE_H + GAP };

function nodeClasses(kind: string, active: boolean, captured: boolean) {
  const base = `topo-node topo-${kind}`;
  if (active) return `${base} topo-active`;
  if (captured) return `${base} topo-captured`;
  return base;
}

export function NetworkTopology() {
  const state = useAppState();
  const t = state.topology;
  const honeypotCaptured = state.honeypot.status === "captured";

  const attackBlue = t.attackActive && t.attackTarget === "blue_team";
  const attackHoneypot = t.attackActive && t.attackTarget === "honeypot";

  const svgW = 40 * 2 + NODE_W * 2 + GAP;
  const svgH = 40 + NODE_H * 2 + GAP + 20;

  return (
    <div className="topology-wrap" role="img" aria-label="Network topology showing Red Team attacking Blue Team and Honeypot">
      <svg className="topology" viewBox={`0 0 ${svgW} ${svgH}`} role="presentation">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Edge: Red → Blue */}
        <g className={`topo-edge-wrap ${attackBlue ? "attack" : ""}`}>
          <line
            className="topo-edge"
            x1={RED.x + NODE_W}
            y1={RED.y + NODE_H / 2}
            x2={BLUE.x}
            y2={BLUE.y + NODE_H / 2}
            markerEnd="url(#arrow)"
          />
        </g>

        {/* Edge: Red → Honeypot */}
        <g className={`topo-edge-wrap ${attackHoneypot ? "attack" : ""}`}>
          <line
            className="topo-edge topo-edge-honey"
            x1={RED.x + NODE_W - 20}
            y1={RED.y + NODE_H}
            x2={HONEY.x + 20}
            y2={HONEY.y}
            markerEnd="url(#arrow)"
          />
        </g>

        {/* Red Team node */}
        <g transform={`translate(${RED.x}, ${RED.y})`}>
          <rect
            className={nodeClasses("red", t.reconActive || attackBlue || attackHoneypot, false)}
            width={NODE_W}
            height={NODE_H}
            rx="8"
          />
          <text className="topo-node-title" x={NODE_W / 2} y={28} textAnchor="middle">
            {ENTITY_LABELS.red_team}
          </text>
          <text className="topo-node-sub" x={NODE_W / 2} y={46} textAnchor="middle">
            {t.reconActive || attackBlue || attackHoneypot ? "ACTIVE" : "IDLE"}
          </text>
        </g>

        {/* Blue Team node */}
        <g transform={`translate(${BLUE.x}, ${BLUE.y})`}>
          <rect
            className={nodeClasses("blue", attackBlue, false)}
            width={NODE_W}
            height={NODE_H}
            rx="8"
          />
          <text className="topo-node-title" x={NODE_W / 2} y={28} textAnchor="middle">
            {ENTITY_LABELS.blue_team}
          </text>
          <text className="topo-node-sub" x={NODE_W / 2} y={46} textAnchor="middle">
            {attackBlue ? "UNDER ATTACK" : "TARGET"}
          </text>
        </g>

        {/* Honeypot node */}
        <g transform={`translate(${HONEY.x}, ${HONEY.y})`}>
          <rect
            className={nodeClasses("honeypot", attackHoneypot, honeypotCaptured)}
            width={NODE_W}
            height={NODE_H}
            rx="8"
          />
          <text className="topo-node-title" x={NODE_W / 2} y={28} textAnchor="middle">
            {ENTITY_LABELS.honeypot}
          </text>
          <text className="topo-node-sub" x={NODE_W / 2} y={46} textAnchor="middle">
            {honeypotCaptured ? "CAPTURED" : "DECOY"}
          </text>
        </g>
      </svg>

      <div className="topology-legend" aria-label="Topology legend">
        <span className="legend-item">
          <span className="legend-dot red-dot" aria-hidden="true" /> Red Team
        </span>
        <span className="legend-item">
          <span className="legend-dot blue-dot" aria-hidden="true" /> Blue Team
        </span>
        <span className="legend-item">
          <span className="legend-dot honey-dot" aria-hidden="true" /> Honeypot
        </span>
      </div>
    </div>
  );
}
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

function nodeClasses(kind: string, active: boolean, captured: boolean, honeyStatus?: string) {
  const base = `topo-node topo-${kind}`;
  if (kind === "honeypot" && honeyStatus) {
    if (honeyStatus === "captured") return `${base} topo-captured`;
    if (honeyStatus === "active") return `${base} topo-active`;
    if (honeyStatus === "armed") return `${base} topo-armed`;
    if (honeyStatus === "initializing") return `${base} topo-initializing`;
  }
  if (active) return `${base} topo-active`;
  if (captured) return `${base} topo-captured`;
  return base; // Always return base class so nodes are visible with default colors
}

export function NetworkTopology() {
  const state = useAppState();
  const t = state.topology;
  const honeypotStatus = state.honeypot.status;
  const honeypotCaptured = honeypotStatus === "captured";

  const attackBlue = t.attackActive && t.attackTarget === "blue_team";
  const attackHoneypot = t.attackActive && t.attackTarget === "honeypot";

  const svgW = 40 * 2 + NODE_W * 2 + GAP;
  const svgH = 40 + NODE_H * 2 + GAP + 20;

  return (
    <div className="topology-wrap" role="img" aria-label="Network topology showing Red Team attacking Blue Team and Honeypot">
      <svg className="topology" viewBox={`0 0 ${svgW} ${svgH}`} role="presentation">
        <defs>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
          </marker>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
          </marker>
          <marker id="arrow-honey" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
          </marker>
          <marker id="arrow-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
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
            markerEnd={attackBlue ? "url(#arrow-blue)" : "url(#arrow-default)"}
            style={{ stroke: attackBlue ? "#3b82f6" : "#64748b" }}
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
            markerEnd={attackHoneypot ? "url(#arrow-honey)" : "url(#arrow-default)"}
            style={{ stroke: attackHoneypot ? "#a78bfa" : "#64748b" }}
          />
        </g>

        {/* Red Team node */}
        <g transform={`translate(${RED.x}, ${RED.y})`}>
          <rect
            className={nodeClasses("red", attackBlue || attackHoneypot, false)}
            width={NODE_W}
            height={NODE_H}
            rx="8"
          />
          <text className="topo-node-title" x={NODE_W / 2} y={28} textAnchor="middle">
            {ENTITY_LABELS.red_team}
          </text>
          <text className="topo-node-sub" x={NODE_W / 2} y={46} textAnchor="middle">
            {attackBlue || attackHoneypot ? "ATTACKING" : "IDLE"}
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
            {attackBlue ? "UNDER ATTACK" : "PROTECTED"}
          </text>
        </g>

        {/* Honeypot node */}
        <g transform={`translate(${HONEY.x}, ${HONEY.y})`}>
          <rect
            className={nodeClasses("honeypot", attackHoneypot, honeypotCaptured, honeypotStatus)}
            width={NODE_W}
            height={NODE_H}
            rx="8"
          />
          <text className="topo-node-title" x={NODE_W / 2} y={28} textAnchor="middle">
            {ENTITY_LABELS.honeypot}
          </text>
          <text className="topo-node-sub" x={NODE_W / 2} y={46} textAnchor="middle">
            {honeypotStatus === "initializing" ? "INITIALIZING" :
             honeypotStatus === "armed" ? "ARMED" :
             honeypotStatus === "active" ? "ACTIVE" :
             honeypotCaptured ? "CAPTURED" : "DECOY"}
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
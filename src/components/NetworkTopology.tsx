import { useAppState } from "../store";
import { deriveEntityStates } from "../entityState";
import { ENTITY_LABELS } from "../types";
import type { EntityId } from "../types";

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

// Tones that keep the small status indicator dot animated on the node.
const LIVE_TONES = new Set<string>([
  "arming",
  "armed",
  "attacking",
  "underattack",
  "defending",
  "capturing",
  "captured",
]);

// Visual class key per entity (matches the CSS namespace: red/blue/honeypot),
// mapping from the EntityId keys used elsewhere in the store.
const KIND_CSS: Record<EntityId, string> = {
  red_team: "red",
  blue_team: "blue",
  honeypot: "honeypot",
};

function nodeClass(kind: EntityId, tone: string): string {
  return `topo-node topo-${KIND_CSS[kind]} topo-st-${tone}`;
}

function dotClass(tone: string): string {
  return `topo-node-dot topo-dot-${tone}${LIVE_TONES.has(tone) ? " topo-dot-live" : ""}`;
}

export function NetworkTopology() {
  const state = useAppState();
  const t = state.topology;
  const cards = deriveEntityStates(state);

  const attackBlue = t.attackActive && t.attackTarget === "blue_team";
  const attackHoneypot = t.attackActive && t.attackTarget === "honeypot";

  const svgW = 40 * 2 + NODE_W * 2 + GAP;
  const svgH = 40 + NODE_H * 2 + GAP + 20;

  return (
    <div
      className="topology-wrap"
      role="img"
      aria-label="Cyber defense topology showing Red Team, Blue Team and Honeypot"
    >
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
            markerEnd={attackBlue ? "url(#arrow-red)" : "url(#arrow-default)"}
            style={{ stroke: attackBlue ? "#ef4444" : "#64748b" }}
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
            className={nodeClass("red_team", cards.red_team.tone)}
            width={NODE_W}
            height={NODE_H}
            rx="8"
          />
          <circle className={dotClass(cards.red_team.tone)} cx={NODE_W - 16} cy={16} r={4} />
          <text className="topo-node-title" x={NODE_W / 2} y={28} textAnchor="middle">
            {ENTITY_LABELS.red_team}
          </text>
          <text
            className={`topo-node-sub topo-sub-${cards.red_team.tone}`}
            x={NODE_W / 2}
            y={46}
            textAnchor="middle"
          >
            {cards.red_team.label}
          </text>
        </g>

        {/* Blue Team node */}
        <g transform={`translate(${BLUE.x}, ${BLUE.y})`}>
          <rect
            className={nodeClass("blue_team", cards.blue_team.tone)}
            width={NODE_W}
            height={NODE_H}
            rx="8"
          />
          <circle className={dotClass(cards.blue_team.tone)} cx={NODE_W - 16} cy={16} r={4} />
          <text className="topo-node-title" x={NODE_W / 2} y={28} textAnchor="middle">
            {ENTITY_LABELS.blue_team}
          </text>
          <text
            className={`topo-node-sub topo-sub-${cards.blue_team.tone}`}
            x={NODE_W / 2}
            y={46}
            textAnchor="middle"
          >
            {cards.blue_team.label}
          </text>
        </g>

        {/* Honeypot node */}
        <g transform={`translate(${HONEY.x}, ${HONEY.y})`}>
          <rect
            className={nodeClass("honeypot", cards.honeypot.tone)}
            width={NODE_W}
            height={NODE_H}
            rx="8"
          />
          <circle className={dotClass(cards.honeypot.tone)} cx={NODE_W - 16} cy={16} r={4} />
          <text className="topo-node-title" x={NODE_W / 2} y={28} textAnchor="middle">
            {ENTITY_LABELS.honeypot}
          </text>
          <text
            className={`topo-node-sub topo-sub-${cards.honeypot.tone}`}
            x={NODE_W / 2}
            y={46}
            textAnchor="middle"
          >
            {cards.honeypot.label}
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
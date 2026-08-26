import { useAppState } from "../store";
import { deriveEntityStates } from "../entityState";
import { ENTITY_LABELS } from "../types";
import type { EntityId } from "../types";

import "./NetworkTopology.css";

// Vertical topology:
//   RED TEAM   (top)
//      │  ▼
//   BLUE TEAM  (middle)
//      │  ▼
//   HONEYPOT  (bottom)
// Straight single connectors — no diagonal/crossing lines, so marker arrowheads
// can never overlap another node or escape the panel.

const NODE_W = 200;
const NODE_H = 64;
const GAP = 56;
const X0 = 40;
const TOP = 20;

const CX = X0 + NODE_W / 2;

const RED = { x: X0, y: TOP };
const BLUE = { x: X0, y: TOP + NODE_H + GAP };
const HONEY = { x: X0, y: TOP + (NODE_H + GAP) * 2 };

const SVG_W = X0 + NODE_W + 40;
const SVG_H = TOP + (NODE_H + GAP) * 2 + NODE_H + 20;

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

// Long state labels ("UNDER ATTACK / DEFENDING") get a tighter font + kerning so
// the text always stays inside the node card instead of spilling past the edge.
function subClass(tone: string, label: string): string {
  const long = label.length > 15;
  return `topo-node-sub topo-sub-${tone}${long ? " topo-sub-long" : ""}`;
}

function renderNode(kind: EntityId, pos: { x: number; y: number }, tone: string, label: string) {
  return (
    <g key={kind} transform={`translate(${pos.x}, ${pos.y})`}>
      <rect className={nodeClass(kind, tone)} width={NODE_W} height={NODE_H} rx="8" />
      <circle className={dotClass(tone)} cx={NODE_W - 16} cy={16} r={4} />
      <text className="topo-node-title" x={NODE_W / 2} y={28} textAnchor="middle">
        {ENTITY_LABELS[kind]}
      </text>
      <text className={subClass(tone, label)} x={NODE_W / 2} y={46} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

export function NetworkTopology() {
  const state = useAppState();
  const cards = deriveEntityStates(state);
  const phase = state.simulation.phase;

  // Connection activity is state-driven:
  //   RED → BLUE      flows while the Red Team attack is in progress
  //   BLUE → HONEYPOT flows while the honeypot is protecting / capturing
  // On idle every connector is a dim static line (no moving arrows).
  const edgeRedActive = phase === "attack";
  const edgeHoneyActive = phase === "honeypot" || phase === "capture";

  return (
    <div
      className="topology-wrap"
      role="img"
      aria-label="Cyber defense topology showing Red Team, Blue Team and Honeypot"
    >
      <svg className="topology" viewBox={`0 0 ${SVG_W} ${SVG_H}`} role="presentation">
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

        {/* Edge: Red Team → Blue Team */}
        <g className={`topo-edge-wrap${edgeRedActive ? " attack" : ""}`}>
          <line
            className="topo-edge"
            x1={CX}
            y1={RED.y + NODE_H}
            x2={CX}
            y2={BLUE.y}
            markerEnd={edgeRedActive ? "url(#arrow-red)" : "url(#arrow-default)"}
            style={{ stroke: edgeRedActive ? "#ef4444" : "#64748b" }}
          />
        </g>

        {/* Edge: Blue Team → Honeypot */}
        <g className={`topo-edge-wrap${edgeHoneyActive ? " attack" : ""}`}>
          <line
            className="topo-edge"
            x1={CX}
            y1={BLUE.y + NODE_H}
            x2={CX}
            y2={HONEY.y}
            markerEnd={edgeHoneyActive ? "url(#arrow-honey)" : "url(#arrow-default)"}
            style={{ stroke: edgeHoneyActive ? "#a78bfa" : "#64748b" }}
          />
        </g>

        {renderNode("red_team", RED, cards.red_team.tone, cards.red_team.label)}
        {renderNode("blue_team", BLUE, cards.blue_team.tone, cards.blue_team.label)}
        {renderNode("honeypot", HONEY, cards.honeypot.tone, cards.honeypot.label)}
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
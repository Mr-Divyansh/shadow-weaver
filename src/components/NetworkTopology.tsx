import { useAppState } from "../store";
import { deriveEntityStates } from "../entityState";
import { ENTITY_LABELS } from "../types";
import type { EntityId } from "../types";

import "./NetworkTopology.css";

// Triangle topology:
//      ┌──────────┐
//      │ RED TEAM │   (top-center)
//      └────┬─────┘
//         ↙     ↘
//      ┌──┴──┐  ┌─────┐
//      │BLUE │  │HONEY│  (bottom row: Blue left, Honeypot right)
//      └─────┘  └─────┘
// Three edges: Red→Blue, Red→Honey (deception), Blue→Honey (containment handoff).
// All connectors are simple straight lines with arrowheads kept away from node
// text areas so markers never overlap labels.

const NODE_W = 200;
const NODE_H = 64;
const NODE_R = 8; // rounded-rect radius

// Triangle layout: Red at top-center, Blue + Honeypot on bottom row.
const TOP = 20;
const COL_L = 20;                 // left column  (Blue)
const COL_R = 260;                // right column (Honeypot)
const ROW_TOP = TOP;              // y of Red
const ROW_BOTTOM = TOP + NODE_H + 48; // y of bottom row

const RED = { x: 130, y: ROW_TOP };
const BLUE = { x: COL_L, y: ROW_BOTTOM };
const HONEY = { x: COL_R, y: ROW_BOTTOM };

const SVG_W = 480;
const SVG_H = ROW_BOTTOM + NODE_H + 32;

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
      <rect className={nodeClass(kind, tone)} width={NODE_W} height={NODE_H} rx={NODE_R} />
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
  //   RED → HONEY     deception path (active during honeypot phase)
  //   BLUE → HONEY    flows while the honeypot is protecting / capturing
  // On idle every connector is a dim static line (no moving arrows).
  const edgeRedActive = phase === "attack";
  const edgeHoneyActive = phase === "honeypot" || phase === "capture";
  const edgeRedHoneyActive = phase === "honeypot" || phase === "capture";

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
          <marker id="arrow-honey" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
          </marker>
          <marker id="arrow-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>

        {/* Edge: Red Team → Blue Team (attack path) */}
        <g className={`topo-edge-wrap${edgeRedActive ? " attack" : ""}`}>
          <line
            className="topo-edge"
            x1={RED.x + NODE_W / 2}
            y1={RED.y + NODE_H}
            x2={BLUE.x + NODE_W / 2}
            y2={BLUE.y}
            markerEnd={edgeRedActive ? "url(#arrow-red)" : "url(#arrow-default)"}
            style={{ stroke: edgeRedActive ? "#ef4444" : "#64748b" }}
          />
        </g>

        {/* Edge: Red Team → Honeypot (deception path) */}
        <g className={`topo-edge-wrap${edgeRedHoneyActive ? " attack" : ""}`}>
          <line
            className="topo-edge"
            x1={RED.x + NODE_W / 2}
            y1={RED.y + NODE_H}
            x2={HONEY.x + NODE_W / 2}
            y2={HONEY.y}
            markerEnd={edgeRedHoneyActive ? "url(#arrow-honey)" : "url(#arrow-default)"}
            style={{ stroke: edgeRedHoneyActive ? "#a78bfa" : "#64748b" }}
          />
        </g>

        {/* Edge: Blue Team → Honeypot (containment handoff) */}
        <g className={`topo-edge-wrap${edgeHoneyActive ? " attack" : ""}`}>
          <line
            className="topo-edge"
            x1={BLUE.x + NODE_W / 2}
            y1={BLUE.y + NODE_H}
            x2={HONEY.x + NODE_W / 2}
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
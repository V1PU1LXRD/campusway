/**
 * directions.js — turns a node path into human-readable walking steps.
 *
 * Turn detection uses the 2D CROSS PRODUCT of the incoming and outgoing
 * direction vectors at each junction:
 *   cross > 0  -> clockwise on screen (y grows downward) -> turn RIGHT
 *   cross < 0  -> counter-clockwise                      -> turn LEFT
 *   tiny angle -> keep straight (steps are merged so instructions stay short)
 *
 * This is another mini DSA moment: simple computational geometry on the graph.
 */

const STRAIGHT_ANGLE_DEG = 25; // below this we call it "straight"
const UTURN_ANGLE_DEG = 145;   // above this we call it a U-turn

function edgeWeight(graph, a, b) {
  const edge = graph.neighbours(a).find((e) => e.to === b);
  return edge ? edge.weight : 0;
}

/** Classify the turn made at junction `atId` coming from prev and heading to next. */
function turnAt(graph, prevId, atId, nextId) {
  const p = graph.getNode(prevId);
  const a = graph.getNode(atId);
  const n = graph.getNode(nextId);

  const v1x = a.x - p.x, v1y = a.y - p.y; // incoming direction
  const v2x = n.x - a.x, v2y = n.y - a.y; // outgoing direction

  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  const angle = Math.abs((Math.atan2(Math.abs(cross), dot) * 180) / Math.PI);

  if (angle < STRAIGHT_ANGLE_DEG) return 'straight';
  if (angle > UTURN_ANGLE_DEG) return 'around';
  return cross > 0 ? 'right' : 'left';
}

/**
 * @returns {string[]} ordered step list, e.g.
 *   ["Start at Main Gate.", "Walk 270 m toward Security Office, then turn left.", ...]
 */
function buildDirections(graph, path) {
  if (!path || path.length === 0) return [];
  if (path.length === 1) {
    return [`You are already at ${graph.getNode(path[0]).name}.`];
  }

  const steps = [`Start at ${graph.getNode(path[0]).name}.`];
  let straightSoFar = 0; // metres accumulated across "straight" segments

  for (let i = 1; i < path.length; i++) {
    const atName = graph.getNode(path[i]).name;
    straightSoFar += edgeWeight(graph, path[i - 1], path[i]);

    const isLast = i === path.length - 1;
    const turn = isLast ? null : turnAt(graph, path[i - 1], path[i], path[i + 1]);

    if (!isLast && turn === 'straight') continue; // merge into one longer step

    if (isLast) {
      steps.push(`Walk ${straightSoFar} m to arrive at ${atName}.`);
    } else if (turn === 'around') {
      steps.push(`Walk ${straightSoFar} m to ${atName}, then turn around toward ${graph.getNode(path[i + 1]).name}.`);
      straightSoFar = 0;
    } else {
      steps.push(`Walk ${straightSoFar} m to ${atName}, then turn ${turn}.`);
      straightSoFar = 0;
    }
  }
  return steps;
}

// Node export for tests. In the browser, buildDirections is a global already.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildDirections, turnAt };
}

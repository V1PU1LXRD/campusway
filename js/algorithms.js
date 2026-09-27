/**
 * Pathfinding algorithms for CampusWay.
 *
 * All three algorithms share the same return contract so the UI can compare
 * them fairly:
 *   {
 *     path:        [nodeId, ...]         source -> ... -> target, or [] if none
 *     distance:    number                total weight (metres), Infinity if none
 *     visitedOrder:[nodeId, ...]         the exact expansion order, for animation
 *     timeMs:      number                wall-clock runtime
 *     visitedCount:number                nodes expanded (popped) before stopping
 *   }
 *
 * They run in well under a millisecond on 16 nodes, so the on-screen
 * animation is a REPLAY of the recorded visit order — not the live compute.
 */

/**
 * Campus modules are loaded as plain browser <script> tags (beginner-friendly:
 * no build step, no bundler). In the browser each file sets a global; under
 * Node's `require` (used by our test runner) globals from one module are not
 * visible to another, so we pin them onto globalThis in each module.
 */
if (typeof MinHeap === 'undefined' && typeof require !== 'undefined') {
  globalThis.MinHeap = require('./heap.js').MinHeap;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Sum of edge weights along a concrete node path (null if a hop is closed —
 * or, in wheelchair mode, if a hop uses a stepped walkway).
 */
function pathDistance(graph, path, mode = 'standard') {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = graph
      .neighbours(path[i], mode)
      .find((e) => e.to === path[i + 1]);
    if (!edge) return null; // route uses a missing/closed walkway
    total += edge.weight;
  }
  return total;
}

/** Rebuild the path from a predecessor map: target -> ... -> source, reversed. */
function reconstructPath(prev, source, target) {
  const path = [];
  let cur = target;
  const seen = new Set();
  while (cur !== undefined) {
    path.push(cur);
    if (cur === source) return path.reverse();
    if (seen.has(cur)) return []; // corrupt-map safety net
    seen.add(cur);
    cur = prev.get(cur);
  }
  return []; // target never linked back to source
}

/* ------------------------------------------------------------------ */
/* BFS — unweighted "fewest hops" route                                 */
/* ------------------------------------------------------------------ */

/**
 * Breadth-First Search explores level by level using a FIFO queue. It ignores
 * edge weights, so it finds the route through the FEWEST BUILDINGS, not the
 * shortest walk. Time O(V + E), space O(V).
 */
function bfsPath(graph, source, target, mode = 'standard') {
  const t0 = performance.now();
  const fail = { path: [], distance: Infinity, visitedOrder: [], timeMs: 0, visitedCount: 0 };
  if (!graph.hasNode(source) || !graph.hasNode(target)) return fail;
  if (source === target) {
    return { path: [source], distance: 0, visitedOrder: [source], timeMs: performance.now() - t0, visitedCount: 1 };
  }

  const prev = new Map();
  const visited = new Set([source]);
  const queue = [source];
  const visitedOrder = [];
  let head = 0; // index-based dequeue: O(1), unlike array.shift()

  while (head < queue.length) {
    const u = queue[head++];
    visitedOrder.push(u);
    if (u === target) break;

    for (const edge of graph.neighbours(u, mode)) {
      const v = edge.to;
      if (!visited.has(v)) {
        visited.add(v);
        prev.set(v, u);
        queue.push(v);
      }
    }
  }

  const found = visited.has(target);
  const path = found ? reconstructPath(prev, source, target) : [];
  return {
    path,
    distance: found ? pathDistance(graph, path, mode) : Infinity,
    visitedOrder,
    timeMs: performance.now() - t0,
    visitedCount: visitedOrder.length,
  };
}

/* ------------------------------------------------------------------ */
/* Dijkstra — optimal shortest walk                                     */
/* ------------------------------------------------------------------ */

/**
 * Dijkstra's algorithm with our hand-built MinHeap. Greedy + provably optimal
 * because all weights (metres) are non-negative: when a node is popped with
 * the smallest tentative distance, no cheaper route can appear later.
 * Time O((V + E) log V) with the heap, space O(V).
 */
function dijkstra(graph, source, target, mode = 'standard') {
  const t0 = performance.now();
  const fail = { path: [], distance: Infinity, visitedOrder: [], timeMs: 0, visitedCount: 0 };
  if (!graph.hasNode(source) || !graph.hasNode(target)) return fail;
  if (source === target) {
    return { path: [source], distance: 0, visitedOrder: [source], timeMs: performance.now() - t0, visitedCount: 1 };
  }

  const dist = new Map();   // best known distance per node
  const prev = new Map();   // predecessor on the best known route
  const settled = new Set(); // nodes whose final distance is locked in
  const heap = new MinHeap((a, b) => a.dist - b.dist);
  const visitedOrder = [];

  dist.set(source, 0);
  heap.push({ node: source, dist: 0 });

  while (!heap.isEmpty()) {
    const { node: u, dist: du } = heap.pop();

    // "Lazy deletion": skip stale heap entries — we may have pushed several
    // entries for the same node as routes improved; only the cheapest matters.
    if (settled.has(u)) continue;
    if (du > (dist.get(u) ?? Infinity)) continue;

    settled.add(u);
    visitedOrder.push(u);
    if (u === target) break; // popped => distance is final and optimal

    for (const edge of graph.neighbours(u, mode)) {
      const candidate = du + edge.weight;
      if (candidate < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, candidate);
        prev.set(edge.to, u);
        heap.push({ node: edge.to, dist: candidate });
      }
    }
  }

  const found = settled.has(target);
  const path = found ? reconstructPath(prev, source, target) : [];
  return {
    path,
    distance: found ? pathDistance(graph, path, mode) : Infinity,
    visitedOrder,
    timeMs: performance.now() - t0,
    visitedCount: visitedOrder.length,
  };
}

/* ------------------------------------------------------------------ */
/* A* — Dijkstra + an admissible Euclidean heuristic                    */
/* ------------------------------------------------------------------ */

/**
 * A* = Dijkstra plus a heuristic h(n) estimating remaining distance. We use
 * straight-line (Euclidean) distance, which never OVERestimates the true
 * remaining walk (a straight line is the best possible case), so the
 * heuristic is "admissible" and A* stays optimal — yet it focuses the search
 * toward the goal and typically expands fewer nodes than Dijkstra.
 *   f(n) = g(n) + h(n)   g = distance so far, h = estimate to go
 */
function aStar(graph, source, target, mode = 'standard') {
  const t0 = performance.now();
  const fail = { path: [], distance: Infinity, visitedOrder: [], timeMs: 0, visitedCount: 0 };
  if (!graph.hasNode(source) || !graph.hasNode(target)) return fail;
  if (source === target) {
    return { path: [source], distance: 0, visitedOrder: [source], timeMs: performance.now() - t0, visitedCount: 1 };
  }

  const gScore = new Map(); // cost from source to node (like dist in Dijkstra)
  const prev = new Map();
  const settled = new Set();
  // Priority = f = g + h. This single line is the whole difference from Dijkstra.
  const heap = new MinHeap((a, b) => a.f - b.f);
  const visitedOrder = [];

  const h = (node) => graph.euclidean(node, target);
  gScore.set(source, 0);
  heap.push({ node: source, f: h(source) });

  while (!heap.isEmpty()) {
    const { node: u } = heap.pop();

    if (settled.has(u)) continue;

    settled.add(u);
    visitedOrder.push(u);
    if (u === target) break;

    const gu = gScore.get(u) ?? Infinity;
    for (const edge of graph.neighbours(u, mode)) {
      const candidate = gu + edge.weight;
      if (candidate < (gScore.get(edge.to) ?? Infinity)) {
        gScore.set(edge.to, candidate);
        prev.set(edge.to, u);
        heap.push({ node: edge.to, f: candidate + h(edge.to) });
      }
    }
  }

  const found = settled.has(target);
  const path = found ? reconstructPath(prev, source, target) : [];
  return {
    path,
    distance: found ? pathDistance(graph, path, mode) : Infinity,
    visitedOrder,
    timeMs: performance.now() - t0,
    visitedCount: visitedOrder.length,
  };
}

/* ------------------------------------------------------------------ */
/* Export for browser globals and Node-based test runs.                 */
/* ------------------------------------------------------------------ */
if (typeof module !== 'undefined' && module.exports) {
  globalThis.MinHeap = MinHeap;
  module.exports = { bfsPath, dijkstra, aStar, pathDistance, reconstructPath };
}

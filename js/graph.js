/**
 * Weighted undirected graph for the campus map.
 *
 * Representation: ADJACENCY LIST (Map<string, Array<Edge>>).
 * Why: our campus graph is sparse (each building connects to ~2-4 walkways),
 * so an adjacency list uses O(V + E) memory and lets us scan a node's
 * neighbours in O(degree) — exactly what Dijkstra/BFS/A* need.
 * (An adjacency matrix would waste O(V^2) space on cells we never use.)
 */
class Graph {
  constructor() {
    /** @type {Map<string, {id:string, name:string, x:number, y:number}>} */
    this.nodes = new Map();
    /** @type {Map<string, Array<{to:string, weight:number, closed:boolean}>>} */
    this.adj = new Map();
  }

  addNode(id, name, x, y) {
    if (this.nodes.has(id)) {
      throw new Error(`Duplicate node id: "${id}"`);
    }
    this.nodes.set(id, { id, name, x, y });
    this.adj.set(id, []);
    return this;
  }

  /**
   * Add a walkway between two buildings. Edges are bidirectional, so we
   * register the edge on both endpoints' lists.
   * @param {string} a  node id
   * @param {string} b  node id
   * @param {number} weight  walking distance in metres (must be > 0)
   */
  addEdge(a, b, weight, opts = {}) {
    if (!this.nodes.has(a) || !this.nodes.has(b)) {
      throw new Error(`addEdge: unknown node in (${a} <-> ${b})`);
    }
    if (typeof weight !== 'number' || !(weight > 0) || !Number.isFinite(weight)) {
      throw new Error(`addEdge: weight must be a positive finite number, got ${weight}`);
    }
    if (a === b) {
      throw new Error('addEdge: self-loops are not allowed');
    }
    // hasSteps: the walkway has stairs or a steep ramp — avoided in
    // wheelchair ("step-free") mode.
    const hasSteps = !!(opts && opts.steps);
    this.adj.get(a).push({ to: b, weight, closed: false, hasSteps });
    this.adj.get(b).push({ to: a, weight, closed: false, hasSteps });
    return this;
  }

  hasNode(id) {
    return this.nodes.has(id);
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  /** All node ids (stable order for tests and rendering). */
  nodeIds() {
    return Array.from(this.nodes.keys());
  }

  /**
   * Open neighbours of a node: [{to, weight, hasSteps}, ...]
   * @param {string} mode 'standard' | 'wheelchair'. In wheelchair mode the
   *        stepped walkways are filtered out too, so the pathfinding
   *        algorithms run unchanged on a slightly smaller subgraph.
   */
  neighbours(id, mode = 'standard') {
    const list = this.adj.get(id);
    if (!list) return [];
    return list.filter((e) => !e.closed && (mode !== 'wheelchair' || !e.hasSteps));
  }

  /**
   * Mark a walkway closed (e.g. "path under repair") on BOTH endpoints.
   * Returns true if at least one edge record was flipped.
   */
  closeEdge(a, b) {
    let flipped = false;
    const flip = (list, other) => {
      for (const e of list) {
        if (e.to === other && !e.closed) {
          e.closed = true;
          flipped = true;
        }
      }
    };
    flip(this.adj.get(a) || [], b);
    flip(this.adj.get(b) || [], a);
    return flipped;
  }

  /** Re-open a walkway on both endpoints. */
  openEdge(a, b) {
    const unflip = (list, other) => {
      for (const e of list) {
        if (e.to === other) e.closed = false;
      }
    };
    unflip(this.adj.get(a) || [], b);
    unflip(this.adj.get(b) || [], a);
  }

  /** Reset every edge to open. */
  openAllEdges() {
    for (const list of this.adj.values()) {
      for (const e of list) e.closed = false;
    }
  }

  /** Straight-line (Euclidean) distance between two nodes — used by A*. */
  euclidean(a, b) {
    const na = this.nodes.get(a);
    const nb = this.nodes.get(b);
    if (!na || !nb) return Infinity;
    const dx = na.x - nb.x;
    const dy = na.y - nb.y;
    return Math.hypot(dx, dy);
  }

  /** Total number of edges (each undirected edge counted once). */
  edgeCount() {
    let total = 0;
    for (const list of this.adj.values()) total += list.length;
    return total / 2;
  }

  /** Number of walkways that have steps (undirected, counted once). */
  steppedEdgeCount() {
    let n = 0;
    for (const list of this.adj.values()) n += list.filter((e) => e.hasSteps).length;
    return n / 2;
  }
}

/**
 * The campus itself — a fictional-but-realistic college campus laid out on a
 * SQUARE 760x760 canvas so the map stays large and readable on portrait
 * phone screens (a wide canvas gets compressed to a thin strip there).
 * Districts run south (arrival) to north (campus edge), like a real map.
 * Weight = walking distance in metres (kept >= straight-line distance so
 * A*'s Euclidean heuristic remains admissible).
 */
function buildCampusGraph() {
  const g = new Graph();

  // id, display name, x, y
  const N = [
    ['gate',       'Main Gate',        80, 690],
    ['security',   'Security Office', 120, 540],
    ['canteen',    'Canteen',          380, 700],
    ['admin',      'Admin Block',      330, 530],
    ['library',    'Library',          560, 500],
    ['fountain',   'Fountain Plaza',   350, 360],
    ['auditorium', 'Auditorium',       680, 690],
    ['lab1',       'Computer Lab 1',   580, 350],
    ['lab2',       'Computer Lab 2',   380, 185],
    ['cs',         'CS Department',    650, 185],
    ['ec',         'EC Department',    670,  60],
    ['workshop',   'Workshop',         430,  70],
    ['sports',     'Sports Complex',   710, 470],
    ['hostel',     'Hostel Circle',     90, 360],
    ['garden',     'Botanical Garden', 110, 190],
    ['temple',     'Campus Temple',    150,  70],
  ];

  for (const [id, name, x, y] of N) g.addNode(id, name, x, y);

  // Walkways: [a, b, metres, hasSteps?]  (hasSteps: true = stairs or steep
  // ramp — these are avoided when the user picks the step-free profile)
  const E = [
    ['gate', 'security', 170],
    ['security', 'admin', 230],
    ['security', 'canteen', 330],
    ['canteen', 'fountain', 360],
    ['admin', 'library', 250],
    ['library', 'lab1', 170],
    ['library', 'fountain', 270],
    ['fountain', 'auditorium', 490],
    ['fountain', 'lab1', 250],
    ['lab1', 'lab2', 280],
    ['lab2', 'cs', 290],
    ['cs', 'ec', 145, true],
    ['cs', 'workshop', 270],
    ['workshop', 'temple', 300, true],
    ['ec', 'sports', 435],
    ['auditorium', 'sports', 240],
    ['admin', 'hostel', 315],
    ['hostel', 'garden', 185],
    ['garden', 'lab1', 520],
    ['garden', 'temple', 145],
    ['canteen', 'auditorium', 320],
    ['hostel', 'security', 200],
  ];

  for (const [a, b, w, steps] of E) g.addEdge(a, b, w, { steps });
  return g;
}

// Export for browser globals and Node-based test runs.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Graph, buildCampusGraph };
}

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
 * 1000x700 canvas (same coordinate space as our SVG map).
 * Weight = walking distance in metres.
 */
function buildCampusGraph() {
  const g = new Graph();

  // id, display name, x, y
  const N = [
    ['gate',      'Main Gate',        60,  620],
    ['security',  'Security Office', 170,  600],
    ['canteen',   'Canteen',          300, 640],
    ['admin',     'Admin Block',      190,  460],
    ['library',   'Library',          350,  470],
    ['fountain',  'Fountain Plaza',   480,  560],
    ['auditorium','Auditorium',       620,  620],
    ['lab1',      'Computer Lab 1',   480,  380],
    ['lab2',      'Computer Lab 2',   620,  360],
    ['cs',        'CS Department',    760,  430],
    ['ec',        'EC Department',    860,  320],
    ['workshop',  'Workshop',         740,  250],
    ['sports',    'Sports Complex',   900,  560],
    ['hostel',    'Hostel Circle',    140,  260],
    ['garden',    'Botanical Garden', 330,  250],
    ['temple',    'Campus Temple',    520,  180],
  ];

  for (const [id, name, x, y] of N) g.addNode(id, name, x, y);

  // Walkways: [a, b, metres, hasSteps?]  (hasSteps: true = stairs or steep
  // ramp — these are avoided when the user picks the step-free profile)
  const E = [
    ['gate', 'security', 120],
    ['security', 'admin', 150],
    ['security', 'canteen', 140],
    ['canteen', 'fountain', 200],
    ['admin', 'library', 165],
    ['library', 'lab1', 160],
    ['library', 'fountain', 170],
    ['fountain', 'auditorium', 160],
    ['fountain', 'lab1', 190],
    ['lab1', 'lab2', 145],
    ['lab2', 'cs', 160],
    ['cs', 'ec', 150, true],
    ['cs', 'workshop', 190],
    ['workshop', 'temple', 235, true],
    ['ec', 'sports', 260],
    ['auditorium', 'sports', 290],
    ['admin', 'hostel', 240],
    ['hostel', 'garden', 200],
    ['garden', 'lab1', 200],
    ['garden', 'temple', 210],
    ['canteen', 'auditorium', 330],
    ['hostel', 'security', 350],
  ];

  for (const [a, b, w, steps] of E) g.addEdge(a, b, w, { steps });
  return g;
}

// Export for browser globals and Node-based test runs.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Graph, buildCampusGraph };
}

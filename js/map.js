/**
 * map.js — renders the campus as an interactive SVG.
 *
 * Layer order (bottom -> top), so effects never hide clickable nodes:
 *   1. decorative background blobs
 *   2. walkway lines (edges)
 *   3. route highlight path
 *   4. visit-effect rings
 *   5. building dots + labels (topmost = always clickable)
 *
 * Accessibility: every building is a focusable <g role="button"> with an
 * aria-label, operable by mouse, touch, Enter and Space.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

const CAMPUS_MAP = {
  viewBox: '0 0 1000 700',
  backgroundBlobs: [
    // purely decorative "green zones" so it feels like a campus, not a spreadsheet
    { cx: 300, cy: 230, rx: 170, ry: 115, fill: 'rgba(52, 211, 153, 0.06)' },
    { cx: 760, cy: 300, rx: 150, ry: 120, fill: 'rgba(139, 92, 246, 0.06)' },
    { cx: 520, cy: 560, rx: 190, ry: 110, fill: 'rgba(77, 163, 255, 0.05)' },
  ],
};

class CampusMap {
  /**
   * @param {HTMLElement} container       element to hold the <svg>
   * @param {Graph} graph                 campus graph
   * @param {(nodeId: string) => void} onNodeClick  building activation handler
   * @param {(nodeId: string) => void} [onVisit]     called when a node is visited (for ARIA status)
   */
  constructor(container, graph, onNodeClick, onVisit = null) {
    this.container = container;
    this.graph = graph;
    this.onNodeClick = onNodeClick;
    this.onVisit = onVisit;
    this.visitColor = null; // set per algorithm by app.js; null = theme color
    this.container = container;
    this.graph = graph;
    this.onNodeClick = onNodeClick;
    this.edgeEls = new Map(); // "a|b" (sorted) -> <line>
    this.nodeEls = new Map(); // nodeId -> <g>
    this.layers = {};
    this._build();
  }

  /* ---------------- construction ---------------- */

  _el(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  _build() {
    const svg = this._el('svg', {
      viewBox: CAMPUS_MAP.viewBox,
      role: 'group',
      'aria-label': 'Interactive campus map. Activate a building to choose a route endpoint.',
    });
    // Exposed so the app can scope theme classes (e.g. per-algorithm colors)
    // to this SVG without reaching into the DOM.
    this.svg = svg;

    // arrowhead for the final route (restrained direction cue)
    const defs = this._el('defs', {});
    const marker = this._el('marker', {
      id: 'route-arrow',
      viewBox: '0 0 10 10',
      refX: '8',
      refY: '5',
      markerWidth: '4.5',
      markerHeight: '4.5',
      orient: 'auto-start-reverse',
    });
    marker.appendChild(this._el('path', { d: 'M 0 0 L 10 5 L 0 10 z', style: 'fill: var(--map-route)' }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    // 1. background blobs
    const bg = this._el('g', { 'aria-hidden': 'true' });
    for (const b of CAMPUS_MAP.backgroundBlobs) {
      bg.appendChild(this._el('ellipse', { cx: b.cx, cy: b.cy, rx: b.rx, ry: b.ry, fill: b.fill }));
    }
    svg.appendChild(bg);

    // 2. edges (each undirected walkway drawn once)
    const gEdges = this._el('g', { 'aria-hidden': 'true' });
    const seen = new Set();
    for (const id of this.graph.nodeIds()) {
      for (const e of this.graph.adj.get(id)) {
        const key = CampusMap.edgeKey(id, e.to);
        if (seen.has(key)) continue;
        seen.add(key);
        const a = this.graph.getNode(id);
        const b = this.graph.getNode(e.to);
        const line = this._el('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          class: e.hasSteps ? 'edge steps' : 'edge',
        });
        this.edgeEls.set(key, line);
        gEdges.appendChild(line);
      }
    }
    svg.appendChild(gEdges);

    // 3 + 4. route and visit layers
    this.layers.route = this._el('path', { class: 'route-line', d: '' });
    this.layers.effects = this._el('g', { 'aria-hidden': 'true' });
    svg.appendChild(this.layers.route);
    svg.appendChild(this.layers.effects);

    // 5. nodes
    const gNodes = this._el('g', {});
    for (const id of this.graph.nodeIds()) {
      const n = this.graph.getNode(id);
      const g = this._el('g', {
        class: 'node',
        tabindex: '0',
        role: 'button',
        'aria-label': `${n.name}. Activate to set as route endpoint.`,
      });
      g.appendChild(this._el('circle', { class: 'node-halo', cx: n.x, cy: n.y, r: 30 })); // generous tap target (small screens scale the SVG down)
      g.appendChild(this._el('circle', { class: 'node-circle', cx: n.x, cy: n.y, r: 14 }));
      const label = this._el('text', { class: 'node-label', x: n.x, y: n.y + 34 });
      label.textContent = n.name;
      g.appendChild(label);

      g.addEventListener('click', () => this.onNodeClick(id));
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          this.onNodeClick(id);
        }
      });
      this.nodeEls.set(id, g);
      gNodes.appendChild(g);
    }
    svg.appendChild(gNodes);

    this.container.appendChild(svg);
  }

  static edgeKey(a, b) {
    return [a, b].sort().join('|');
  }

  /* ---------------- endpoint marking ---------------- */

  markSource(id) { this._setRole('is-source', id); }
  markTarget(id) { this._setRole('is-target', id); }

  _setRole(cls, id) {
    for (const g of this.nodeEls.values()) g.classList.remove(cls);
    const g = id && this.nodeEls.get(id);
    if (g) g.classList.add(cls);
  }

  clearEndpoints() {
    for (const g of this.nodeEls.values()) {
      g.classList.remove('is-source', 'is-target');
    }
  }

  /* ---------------- route drawing ---------------- */

  /**
   * Draw the route as a polyline through the node coordinates.
   * Animate it "growing" with a stroke-dash transition (unless the user
   * prefers reduced motion — CSS disables the transition there).
   */
  drawRoute(path, animate = true) {
    this.clearRoute();
    if (!path || path.length < 2) return;

    const pts = path.map((id) => this.graph.getNode(id));
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;

    const el = this.layers.route;
    // The direction arrowhead only makes sense on multi-hop routes.
    el.setAttribute('marker-end', path.length > 2 ? 'url(#route-arrow)' : '');
    el.setAttribute('d', d);

    const reduceMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const playDraw = animate && !reduceMotion;

    const len = el.getTotalLength();
    if (playDraw) {
      el.classList.add('is-drawing');
      el.style.strokeDasharray = `${len}`;
      el.style.strokeDashoffset = `${len}`;
      // force a reflow so the transition from offset -> 0 actually plays
      void el.getBoundingClientRect();
      el.style.strokeDashoffset = '0';
      // one-shot: drop the drawing flag once the draw-in finishes
      const done = () => el.classList.remove('is-drawing');
      el.addEventListener('transitionend', done, { once: true });
      window.setTimeout(done, 900); // fallback if the event is missed
    } else {
      el.style.strokeDasharray = ''; // solid line immediately
      el.style.strokeDashoffset = '';
    }

    for (const id of path) {
      const g = this.nodeEls.get(id);
      if (g) g.classList.add('visited');
    }
  }

  clearRoute() {
    const el = this.layers.route;
    el.setAttribute('d', '');
    el.setAttribute('marker-end', '');
    el.style.strokeDasharray = '';
    el.style.strokeDashoffset = '';
    el.classList.remove('is-drawing');
  }

  /* ---------------- visit effects ---------------- */

  /** One expanding ring on a node + persistent "visited" tint. */
  showVisit(nodeId) {
    const n = this.graph.getNode(nodeId);
    if (!n) return;
    if (typeof this.onVisit === 'function') this.onVisit(nodeId);
    const ring = this._el('circle', { class: 'visit-ring', cx: n.x, cy: n.y, r: 18 });
    if (this.visitColor) ring.style.stroke = this.visitColor;
    ring.addEventListener('animationend', () => ring.remove());
    this.layers.effects.appendChild(ring);
  }

  clearVisits() {
    this.layers.effects.replaceChildren();
    for (const g of this.nodeEls.values()) g.classList.remove('visited');
  }

  /* ---------------- closed walkways ---------------- */

  setEdgeClosed(a, b, closed) {
    const el = this.edgeEls.get(CampusMap.edgeKey(a, b));
    if (el) el.classList.toggle('closed', closed);
  }

  setAllEdgesOpen() {
    for (const el of this.edgeEls.values()) el.classList.remove('closed');
  }

  /* ---------------- reset everything visual ---------------- */

  reset() {
    this.clearEndpoints();
    this.clearRoute();
    this.clearVisits();
  }
}

// Node export so the file can be sanity-checked outside the browser too.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CampusMap, CAMPUS_MAP };
}

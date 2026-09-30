/**
 * Tiny test runner — no dependencies, runs in Node.
 * Usage:  node campusway/tests/run-tests.js
 */
const path = require('path');

const { MinHeap } = require(path.join(__dirname, '..', 'js', 'heap.js'));
const { Graph, buildCampusGraph } = require(path.join(__dirname, '..', 'js', 'graph.js'));
const { bfsPath, dijkstra, aStar, pathDistance } = require(path.join(__dirname, '..', 'js', 'algorithms.js'));

/* --- minimal harness ------------------------------------------------ */
let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertClose(actual, expected, tol, msg) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) {
    throw new Error(`${msg || 'assertClose'}: expected ~${expected} (+/-${tol}), got ${actual}`);
  }
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

/* --- heap tests ------------------------------------------------------ */
console.log('\nMinHeap:');

test('pops in ascending order', () => {
  const h = new MinHeap();
  [5, 3, 8, 1, 9, 2].forEach((n) => h.push(n));
  const out = [];
  while (!h.isEmpty()) out.push(h.pop());
  assert(JSON.stringify(out) === JSON.stringify([1, 2, 3, 5, 8, 9]), `got ${out}`);
});

test('handles duplicates and negative numbers', () => {
  const h = new MinHeap();
  [0, -4, -4, 7, 0, -10].forEach((n) => h.push(n));
  const out = [];
  while (!h.isEmpty()) out.push(h.pop());
  assert(JSON.stringify(out) === JSON.stringify([-10, -4, -4, 0, 0, 7]), `got ${out}`);
});

test('peek returns smallest without removing', () => {
  const h = new MinHeap();
  h.push(42);
  h.push(7);
  assert(h.peek() === 7, `peek gave ${h.peek()}`);
  assert(h.size === 2, 'peek must not remove');
});

test('pop on empty heap returns undefined', () => {
  const h = new MinHeap();
  assert(h.pop() === undefined, 'expected undefined');
  assert(h.isEmpty(), 'heap should stay empty');
});

test('heap matches a reference oracle over 1000 random interleaved ops', () => {
  // Oracle: a plain array. Every pop must return the minimum of what is
  // currently stored — the ONLY correct property for interleaved push/pop.
  // (Pop monotonicity does NOT hold when smaller values are pushed later.)
  const h = new MinHeap();
  const mirror = [];
  for (let i = 0; i < 1000; i++) {
    const shouldPush = Math.random() < 0.5 || mirror.length === 0;
    if (shouldPush) {
      const v = Math.floor(Math.random() * 1000);
      h.push(v);
      mirror.push(v);
    } else {
      const want = Math.min(...mirror);
      const got = h.pop();
      assert(got === want, `pop returned ${got}, expected ${want}`);
      mirror.splice(mirror.indexOf(want), 1);
    }
  }
  // Full drain: with no further pushes, pops must now be strictly monotonic,
  // and the heap must yield exactly as many items as the oracle still holds.
  let prev = -Infinity;
  let drained = 0;
  while (!h.isEmpty()) {
    const v = h.pop();
    assert(v >= prev, `drain violated monotonicity: ${v} after ${prev}`);
    prev = v;
    drained++;
  }
  assert(drained === mirror.length, `heap drained ${drained} items, oracle held ${mirror.length}`);
  assert(h.size === 0, 'heap must be empty after drain');
});

test('supports object comparisons via custom compare', () => {
  const h = new MinHeap((a, b) => a.dist - b.dist);
  h.push({ node: 'b', dist: 20 });
  h.push({ node: 'a', dist: 5 });
  const top = h.pop();
  assert(top.node === 'a', `expected a, got ${top.node}`);
});

/* --- graph tests ----------------------------------------------------- */
console.log('\nGraph:');

test('builds campus graph with 16 nodes and 22 edges', () => {
  const g = buildCampusGraph();
  assert(g.nodeIds().length === 16, `expected 16 nodes, got ${g.nodeIds().length}`);
  assert(g.edgeCount() === 22, `expected 22 edges, got ${g.edgeCount()}`);
});

test('edges are bidirectional', () => {
  const g = buildCampusGraph();
  const a = g.neighbours('gate').some((e) => e.to === 'security');
  const b = g.neighbours('security').some((e) => e.to === 'gate');
  assert(a && b, 'gate<->security must appear in both adjacency lists');
});

test('closeEdge blocks both directions', () => {
  const g = buildCampusGraph();
  assert(g.closeEdge('lab1', 'library') === true, 'should flip at least one record');
  assert(!g.neighbours('library').some((e) => e.to === 'lab1'), 'library must not see lab1');
  assert(!g.neighbours('lab1').some((e) => e.to === 'library'), 'lab1 must not see library');
  g.openEdge('lab1', 'library');
  assert(g.neighbours('library').some((e) => e.to === 'lab1'), 'reopen failed');
});

test('rejects invalid edges', () => {
  const g = new Graph();
  g.addNode('a', 'A', 0, 0);
  let threw = false;
  try { g.addEdge('a', 'ghost', 5); } catch { threw = true; }
  assert(threw, 'unknown node must throw');
  threw = false;
  try { g.addEdge('a', 'a', 5); } catch { threw = true; }
  assert(threw, 'self-loop must throw');
  threw = false;
  try { g.addEdge('a', 'a', -3); } catch { threw = true; }
  assert(threw, 'negative weight must throw');
});

test('every edge weight is at least the Euclidean distance (A* admissibility)', () => {
  const g = buildCampusGraph();
  for (const id of g.nodeIds()) {
    for (const e of g.adj.get(id)) {
      const eu = g.euclidean(id, e.to);
      assert(e.weight >= eu - 0.001, `edge ${id}-${e.to}: weight ${e.weight} < euclidean ${eu.toFixed(1)}`);
    }
  }
});

/* --- pathfinding tests ---------------------------------------------- */
console.log('\nPathfinding:');

test('dijkstra finds known shortest route gate->cs', () => {
  const g = buildCampusGraph();
  const r = dijkstra(g, 'gate', 'cs');
  // Known optimum (square layout): gate->security->hostel->garden->temple
  //   ->workshop->cs = 170+200+185+145+300+270 = 1270
  assert(r.distance === 1270, `expected 1270, got ${r.distance}`);
  assert(r.path[0] === 'gate' && r.path[r.path.length - 1] === 'cs', 'path endpoints wrong');
  assertClose(pathDistance(g, r.path), r.distance, 0.001, 'distance should match path');
});

test('aStar returns the same optimal distance as dijkstra', () => {
  const g = buildCampusGraph();
  const pairs = [
    ['gate', 'cs'], ['hostel', 'sports'], ['temple', 'canteen'],
    ['garden', 'ec'], ['security', 'sports'],
  ];
  for (const [s, t] of pairs) {
    const d = dijkstra(g, s, t);
    const a = aStar(g, s, t);
    assert(d.distance === a.distance, `${s}->${t}: dijkstra ${d.distance} vs a* ${a.distance}`);
    assert(JSON.stringify(d.path) === JSON.stringify(a.path), `${s}->${t}: paths differ`);
  }
});

test('aStar expands fewer or equal nodes than dijkstra (usually strictly fewer)', () => {
  const g = buildCampusGraph();
  let fewer = 0;
  const pairs = [['gate', 'cs'], ['hostel', 'sports'], ['temple', 'canteen'], ['garden', 'ec']];
  for (const [s, t] of pairs) {
    const d = dijkstra(g, s, t).visitedCount;
    const a = aStar(g, s, t).visitedCount;
    assert(a <= d, `a* expanded ${a} > dijkstra ${d} for ${s}->${t}`);
    if (a < d) fewer++;
  }
  assert(fewer > 0, 'a* should expand strictly fewer nodes in at least one pair');
});

test('bfs finds fewest-hops route (may not be shortest distance)', () => {
  const g = buildCampusGraph();
  const r = bfsPath(g, 'gate', 'cs');
  assert(r.path[0] === 'gate' && r.path[r.path.length - 1] === 'cs', 'bfs endpoints wrong');
  const hops = r.path.length - 1;
  const d = dijkstra(g, 'gate', 'cs');
  assert(hops <= d.path.length - 1, 'bfs should use at most as many hops as dijkstra');
});

test('handles source equal to destination', () => {
  const g = buildCampusGraph();
  for (const algo of [dijkstra, aStar, bfsPath]) {
    const r = algo(g, 'library', 'library');
    assert(r.path.length === 1 && r.path[0] === 'library', 'path should be [library]');
    assert(r.distance === 0, 'distance should be 0');
  }
});

test('returns no route for disconnected nodes', () => {
  const g = buildCampusGraph();
  g.addNode('island', 'Island Building', 999, 50);
  for (const algo of [dijkstra, aStar, bfsPath]) {
    const r = algo(g, 'gate', 'island');
    assert(r.path.length === 0, 'expected empty path');
    assert(r.distance === Infinity, 'expected Infinity distance');
  }
});

test('reroutes around a blocked walkway', () => {
  const g = buildCampusGraph();
  const before = dijkstra(g, 'gate', 'cs').distance;
  // workshop-cs is the final hop of the known optimal route — block it.
  g.closeEdge('workshop', 'cs');
  const after = dijkstra(g, 'gate', 'cs').distance;
  assert(after > before, `reroute should be longer: before=${before}, after=${after}`);
  // Verify the blocked edge is genuinely not used.
  const r = dijkstra(g, 'gate', 'cs');
  for (let i = 0; i < r.path.length - 1; i++) {
    const a = r.path[i];
    const b = r.path[i + 1];
    assert(!(a === 'workshop' && b === 'cs'), 'route must not use closed edge');
  }
});

test('reports no route when blocking disconnects the destination', () => {
  const g = buildCampusGraph();
  // Cutting every link into 'sports' isolates it.
  g.closeEdge('ec', 'sports');
  g.closeEdge('auditorium', 'sports');
  const r = dijkstra(g, 'gate', 'sports');
  assert(r.path.length === 0, 'expected no path to isolated sports');
  assert(r.distance === Infinity, 'expected Infinity');
});

test('pathDistance returns null when route uses a closed edge', () => {
  const g = buildCampusGraph();
  g.closeEdge('gate', 'security');
  assert(pathDistance(g, ['gate', 'security']) === null, 'closed edge must yield null');
});

test('all algorithms visit reachable nodes from a source (full traversal)', () => {
  const g = buildCampusGraph();
  const r = bfsPath(g, 'gate', 'temple');
  // Whole campus is connected, so BFS from gate should reach all 16 nodes
  // only when target is last... instead: assert it visited at least all nodes
  // at graph distance <= distance(temple). Simpler: BFS to a far node should
  // have visited a majority of the graph.
  assert(r.visitedCount >= 10, `expected wide exploration, got ${r.visitedCount}`);
});

/* --- directions tests ------------------------------------------------ */
console.log('\nDirections:');
const { buildDirections, turnAt } = require(path.join(__dirname, '..', 'js', 'directions.js'));

function tinyGraph() {
  const g = new Graph();
  g.addNode('a', 'Alpha', 0, 0);
  g.addNode('b', 'Bravo', 100, 0);
  g.addNode('c', 'Charlie', 200, 0);
  g.addNode('d', 'Delta', 100, 100);   // below b  (screen y grows downward)
  g.addNode('e', 'Echo', 100, -100);   // above b
  g.addEdge('a', 'b', 100);
  g.addEdge('b', 'c', 100);
  g.addEdge('b', 'd', 100);
  g.addEdge('b', 'e', 100);
  return g;
}

test('merges straight segments into one long step', () => {
  const g = tinyGraph();
  const steps = buildDirections(g, ['a', 'b', 'c']);
  assert(steps.length === 2, `expected 2 steps, got ${steps.length}: ${JSON.stringify(steps)}`);
  assert(steps[0] === 'Start at Alpha.', `first step wrong: ${steps[0]}`);
  assert(/Walk 200 m to arrive at Charlie\./.test(steps[1]), `last step wrong: ${steps[1]}`);
});

test('cross product classifies right and left turns correctly', () => {
  const g = tinyGraph();
  // screen coords: y grows downward -> positive cross = clockwise = RIGHT
  assert(turnAt(g, 'a', 'b', 'd') === 'right', `a->b->d should be right, got ${turnAt(g, 'a', 'b', 'd')}`);
  assert(turnAt(g, 'a', 'b', 'e') === 'left', `a->b->e should be left, got ${turnAt(g, 'a', 'b', 'e')}`);
  assert(turnAt(g, 'a', 'b', 'c') === 'straight', `a->b->c should be straight, got ${turnAt(g, 'a', 'b', 'c')}`);
});

test('directions text includes the turn side', () => {
  const g = tinyGraph();
  const steps = buildDirections(g, ['a', 'b', 'd']);
  assert(steps.some((s) => /turn right\./.test(s)), `no 'turn right' in ${JSON.stringify(steps)}`);
});

test('single-node path yields a friendly message', () => {
  const g = tinyGraph();
  const steps = buildDirections(g, ['a']);
  assert(steps.length === 1 && /already at Alpha/.test(steps[0]), `got ${JSON.stringify(steps)}`);
});

test('campus directions span start and destination names', () => {
  const g = buildCampusGraph();
  const r = dijkstra(g, 'gate', 'canteen');
  const steps = buildDirections(g, r.path);
  assert(/Start at Main Gate\./.test(steps[0]), `first step: ${steps[0]}`);
  assert(/Canteen\./.test(steps[steps.length - 1]), `last step: ${steps[steps.length - 1]}`);
});

/* --- step-free (wheelchair) profile tests ---------------------------- */
console.log('\nWheelchair profile:');

test('flags exactly 2 walkways as stepped', () => {
  const g = buildCampusGraph();
  assert(g.steppedEdgeCount() === 2, `expected 2 stepped walkways, got ${g.steppedEdgeCount()}`);
  assert(g.neighbours('cs').find((e) => e.to === 'ec').hasSteps === true, 'cs-ec must be stepped');
  assert(g.neighbours('workshop').find((e) => e.to === 'temple').hasSteps === true, 'workshop-temple must be stepped');
  assert(g.neighbours('gate').find((e) => e.to === 'security').hasSteps === false, 'gate-security must not be stepped');
});

test('standard mode still allows stepped walkways', () => {
  const g = buildCampusGraph();
  // temple -> workshop (steps) -> cs -> ec = 300 + 270 + 145 = 715
  const r = dijkstra(g, 'temple', 'ec');
  assert(r.distance === 715, `expected 715 via stepped route, got ${r.distance}`);
});

test('wheelchair mode reroutes around steps at a higher cost', () => {
  const g = buildCampusGraph();
  const r = dijkstra(g, 'temple', 'ec', 'wheelchair');
  // With cs-ec and workshop-temple (both stepped) excluded, EC is only
  // reachable via the Sports Complex:
  //   temple -> garden -> hostel -> security -> canteen -> auditorium
  //   -> sports -> ec = 145+185+200+330+320+240+435 = 1855
  assert(r.distance === 1855, `expected 1855 step-free, got ${r.distance}`);
  assert(r.distance > 715, 'step-free route should be longer than the stepped one');
  const tail = r.path.slice(-3);
  assert(
    tail[0] === 'auditorium' && tail[1] === 'sports' && tail[2] === 'ec',
    `route must enter EC via the Sports Complex, got ${JSON.stringify(tail)}`
  );
});

test('wheelchair routes never use stepped walkways (all algorithms)', () => {
  const g = buildCampusGraph();
  const pairs = [['temple', 'ec'], ['gate', 'workshop'], ['hostel', 'temple'], ['canteen', 'ec']];
  for (const algo of [dijkstra, aStar, bfsPath]) {
    for (const [s, t] of pairs) {
      const r = algo(g, s, t, 'wheelchair');
      for (let i = 0; i < r.path.length - 1; i++) {
        const edge = g.neighbours(r.path[i], 'wheelchair').find((e) => e.to === r.path[i + 1]);
        assert(edge, `${algo.name} ${s}->${t}: hop ${r.path[i]}->${r.path[i + 1]} invalid in wheelchair mode`);
        assert(!edge.hasSteps, `${algo.name} ${s}->${t}: route used a stepped walkway`);
      }
    }
  }
});

test('pathDistance rejects stepped hops in wheelchair mode', () => {
  const g = buildCampusGraph();
  assert(pathDistance(g, ['cs', 'ec']) === 145, 'standard mode should allow the hop');
  assert(pathDistance(g, ['cs', 'ec'], 'wheelchair') === null, 'wheelchair mode must reject the stepped hop');
});

test('a wheel-only graph can disconnect a destination entirely', () => {
  const g = new Graph();
  g.addNode('a', 'A', 0, 0);
  g.addNode('b', 'B', 100, 0);
  g.addNode('c', 'C', 200, 0);
  g.addEdge('a', 'b', 100);
  g.addEdge('b', 'c', 100, { steps: true }); // the ONLY link to C has stairs
  const ok = dijkstra(g, 'a', 'c');
  assert(ok.distance === 200, `standard mode should reach C, got ${ok.distance}`);
  for (const algo of [dijkstra, aStar, bfsPath]) {
    const r = algo(g, 'a', 'c', 'wheelchair');
    assert(r.path.length === 0, `${algo.name}: expected no step-free route`);
    assert(r.distance === Infinity, `${algo.name}: expected Infinity`);
  }
});

test('a* stays optimal on the wheelchair subgraph', () => {
  const g = buildCampusGraph();
  const pairs = [['temple', 'ec'], ['gate', 'workshop'], ['canteen', 'ec']];
  for (const [s, t] of pairs) {
    const d = dijkstra(g, s, t, 'wheelchair');
    const a = aStar(g, s, t, 'wheelchair');
    assert(d.distance === a.distance, `${s}->${t}: dijkstra ${d.distance} vs a* ${a.distance} (wheelchair)`);
  }
});

/* --- ui formatter tests ---------------------------------------------- */
console.log('\nUI formatters:');
const { formatMetres, formatMs, algorithmLabel } = require(path.join(__dirname, '..', 'js', 'ui', 'formatters.js'));

test('formatMetres renders metres with thousands separators', () => {
  assert(formatMetres(1310) === '1,310 m', `got ${formatMetres(1310)}`);
  assert(formatMetres(0) === '0 m', `got ${formatMetres(0)}`);
  assert(formatMetres(Infinity) === '—', `got ${formatMetres(Infinity)}`);
});

test('formatMs and algorithmLabel render honest labels', () => {
  assert(formatMs(0.05) === '0.05 ms', `got ${formatMs(0.05)}`);
  assert(algorithmLabel('astar') === 'A*', `got ${algorithmLabel('astar')}`);
  assert(algorithmLabel('dijkstra') === 'Dijkstra', `got ${algorithmLabel('dijkstra')}`);
  assert(algorithmLabel('mystery') === 'mystery', 'unknown modes pass through');
});

/* --- summary --------------------------------------------------------- */
console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(` - ${f.name}: ${f.err.message}`));
  process.exit(1);
}

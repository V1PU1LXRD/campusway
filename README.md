# 🗺️ CampusWay

**Find your way, the smart way.**

CampusWay is an interactive campus route finder that shows — live, on screen — how three classic pathfinding algorithms solve the same real-world problem: *what is the fastest way to walk from one campus building to another?*

Pick any two buildings on the map and watch **Dijkstra** (with a hand-written binary min-heap), **A\*** (with a Euclidean heuristic), and **BFS** explore the campus graph node by node, then compare their routes, node counts, and runtimes side by side. Close a walkway for "repairs" and the app reroutes instantly.

> Built as a Data Structures & Algorithms mini project using **vanilla HTML, CSS and JavaScript only** — no frameworks, no build step, no paid APIs, no API keys.

**🔴 Live demo:** [v1pu1lxrd.github.io/campusway](https://v1pu1lxrd.github.io/campusway/) — hosted free on GitHub Pages.

---

## ✨ Features

- 🖱️ **Interactive SVG campus map** — 16 buildings, 22 walkways; click (or Tab + Enter) any building to set a start and destination.
- 🧭 **Three routing strategies** — Fastest (Dijkstra), Guided (A\*), Fewest stops (BFS).
- 🎬 **Exploration animation** — a ring fires on each node in the exact order the algorithm expanded it.
- 📊 **Algorithm comparison cards** — distance, hops, nodes explored and compute time for all three strategies, each with a factual tag ("Shortest distance", "Fewest hops", "Heuristic-guided") and one-click switching of the displayed route.
- 🧱 **Closed walkways** — mark any path as "under repair"; the route recalculates automatically. Block everything and the app explains why no route exists.
- ♿ **Step-free route profile** — two walkways have stairs/steep ramps (dashed amber). Switch to the ♿ Step-free profile and *all three algorithms* re-run on the subgraph without them — same code, different graph.
- 🧾 **Turn-by-turn directions** — human-readable steps ("Walk 270 m to Library, then turn left") generated with cross-product turn detection.
- ♿ **Accessible & responsive** — keyboard-operable buildings, screen-reader announcements, visible focus rings, reduced-motion support, single-column layout on phones.
- 🧭 **"Campus Navigation Lab" interface** — light academic theme with an optional **dark mode** (header toggle, remembered across visits, follows your OS preference by default), sticky header with an *About Algorithms* dialog, an onboarding card that collapses into a status bar, and a Route Insights panel organized as setup → comparison → directions → summary.

## 🧠 The DSA inside

| Concept | Where | Why this choice | Complexity |
|---|---|---|---|
| **Adjacency-list graph** | `js/graph.js` | The campus graph is sparse; lists use O(V+E) memory and give O(degree) neighbour scans (a matrix would waste O(V²)). | Build O(V+E) |
| **Binary min-heap** (from scratch) | `js/heap.js` | Dijkstra needs the cheapest frontier node fast. A sorted array or linear scan would cost O(V) per pop; the heap gives O(log V). | push/pop O(log V) |
| **Dijkstra's algorithm** | `js/algorithms.js` | All walkway weights (metres) are non-negative, so Dijkstra's greedy choice is provably optimal. Uses *lazy deletion* instead of decrease-key. | O((V+E) log V) |
| **BFS** | `js/algorithms.js` | Ignores weights → finds the route through the fewest buildings. Great contrast with Dijkstra in the demo. | O(V+E) |
| **A\* search** | `js/algorithms.js` | Straight-line distance is *admissible* (never overestimates), so A\* stays optimal while expanding fewer nodes than Dijkstra. | O((V+E) log V), fewer expansions |
| **Path reconstruction** | all algorithms | Predecessor map walked backwards from the target. | O(V) |
| **Cross-product geometry** | `js/directions.js` | The 2D cross product of incoming/outgoing vectors classifies left/right turns for the step list. | O(path length) |
| **Mode-based subgraph filtering** | `Graph.neighbours(id, mode)` | The wheelchair profile is not a separate algorithm: stepped edges are filtered out of the neighbour lists, so Dijkstra/BFS/A\* run *unchanged* on a slightly smaller subgraph. One implementation, two graphs. | O(V+E) per scan |

Every edge weight is chosen to be at least the straight-line distance between its endpoints — a test enforces this, because that property is exactly what makes A\*'s heuristic admissible.

## 📁 Project structure

```
campusway/
├── index.html              app shell (semantic, accessible)
├── css/
│   ├── tokens.css          design tokens (color, spacing, radii, motion)
│   ├── globals.css         reset, focus-visible, reduced motion, skip link
│   └── components.css      header, hero, panels, map, cards, dialog
├── js/
│   ├── heap.js             binary min-heap (written from scratch)
│   ├── graph.js            adjacency-list graph + campus data
│   ├── algorithms.js       Dijkstra, BFS, A* (shared result contract)
│   ├── map.js              interactive SVG rendering + exploration replay
│   ├── directions.js       cross-product turn detection
│   ├── app.js              UI state and wiring
│   └── ui/                 formatters + accessible dialog helper
├── tests/run-tests.js      35 dependency-free tests
└── docs/viva-prep.md       likely viva questions with answers
```

## 🚀 Run it locally

No install, no build step:

1. Download or clone this folder.
2. Double-click **`index.html`** — that's it.

Or serve it (nicer URLs, required by some browsers for future features):

```bash
npx serve campusway
# or:  python -m http.server
```

## 🧪 Run the tests

The test suite uses a tiny hand-written runner — **zero dependencies**:

```bash
cd campusway
npm test          # or: node tests/run-tests.js
```

35 tests cover the heap (including an oracle-based stress test of 1,000 interleaved operations), graph invariants, optimality of Dijkstra vs A\*, rerouting around closed walkways, disconnected-node handling, the turn-direction engine, the step-free profile (including a case where it disconnects a destination entirely), and the UI formatters.

## 📖 How to use

1. **Click a building** on the map — it turns green (start).
2. **Click another** — it turns red (destination) and the route runs immediately.
3. Use the **algorithm cards** in Route Insights to replay the same trip with Dijkstra, A\*, or BFS and compare their metrics.
4. **Close a walkway** from the dropdown to simulate repairs — the route reroutes live; click a red ✕ chip to reopen it.
5. Switch to **♿ Step-free** and re-run the same trip — the route avoids the dashed amber (steps) walkways, gets longer, and occasionally has *no step-free route at all*.
6. **Reset** clears everything.

## 🖼️ Screenshots

> Capture plan (1,440px desktop unless noted):
> 1. **Empty state** — hero guide + map with nothing selected (shows the onboarding).
> 2. **Dijkstra completed route** — exploration rings faded, final route drawn, Route Insights filled.
> 3. **Comparison state** — all three algorithm cards expanded with metrics.
> 4. **Step-free route** — ♿ profile active, stepped walkways dashed amber, longer reroute visible.
> 5. **Mobile layout** — 390px width showing the stacked map-first layout.

## 🎬 2-minute demo script

1. *"This is CampusWay — it answers one question: what's the fastest walk across campus?"* → click Main Gate, then CS Department.
2. *"The rings show Dijkstra expanding the graph — every node lights up in the exact order the algorithm visited it."*
3. *"The comparison table shows all three algorithms on the same problem: Dijkstra guarantees the shortest distance, A\* reaches the same answer but explores fewer nodes thanks to its straight-line heuristic, and BFS just minimizes the number of buildings passed."*
4. *"Now the fun part — the walkway outside the library is closed for repairs."* → close Library ↔ Computer Lab 1 → *"and the app reroutes around it automatically."*
5. *"Under the hood it's a hand-built adjacency-list graph, a binary min-heap written from scratch, and 35 passing tests."*
6. *"One more thing — accessibility."* → switch to ♿ Step-free → *"the same algorithms now run on a subgraph without stairs: no extra code, just a filtered graph. Try it with the Sports Complex walkway closed and there's no step-free route at all."*

## 🎨 UI/UX Design

CampusWay follows a calm **"Campus Navigation Lab"** visual language: an off-white/slate canvas, deep-navy text, one muted-blue primary, and restrained emerald and amber accents — chosen to stay readable on projectors and in screenshots. All styling flows from design tokens (`css/tokens.css`): a 4–32px spacing scale, 10–16px radii, system fonts, and soft shadows reserved for elevation hierarchy.

The layout mirrors the task: a dominant map panel (~65%) beside a Route Insights panel (~35%) ordered *setup → comparison → directions → summary*. An onboarding card teaches the three-step interaction and collapses into a slim status bar once a route is chosen, keeping the map central. Motion is limited to three restrained touches — a one-time hero text reveal, a soft highlight on the selected algorithm card, and brief number transitions on metric updates — all disabled under `prefers-reduced-motion`.

Accessibility is built in: buildings are focusable buttons with visible focus rings and screen-reader names; algorithm and profile choices are radio groups with arrow-key roving focus; route status and exploration are announced via a polite live region; the About Algorithms dialog uses the native `<dialog>` element (focus trap, Escape to close, focus returned to the trigger); stepped, step-free and closed walkways are distinguished by dash patterns rather than color alone; and text/contrast pairs were chosen to meet WCAG AA in **both themes**. The layout works from 320px phones to desktop.

Theming is fully token-driven: dark mode is a `[data-theme="dark"]` block that redefines the same semantic variables, so every surface, map element and algorithm color adapts with zero component-level exceptions. The choice is applied before first paint (no flash), persisted in `localStorage`, and falls back to your OS preference.

> Honesty note: "nodes explored" counts buildings the algorithm examined and "compute time" is the algorithm's own runtime — the on-map animation is a replay of the recorded visit order, not a benchmark. BFS is reported by hops because it optimizes the number of edges, not weighted distance.

## 🔮 Future scope

- Live "you are here" via the browser Geolocation API.
- Editable map: add buildings and walkways from the UI.
- Indoor floor plans as nested graphs.

## 📜 License

MIT — free to learn from, reuse, and improve.

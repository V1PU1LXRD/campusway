# 🎤 CampusWay — Viva Prep: 10 Likely Questions

**Q1. Why did you use an adjacency list instead of an adjacency matrix?**
The campus graph is *sparse* — 16 buildings with ~2–4 walkways each. An adjacency list stores only real edges: O(V + E) memory, and finding a node's neighbours costs O(degree). A matrix would need 16×16 = 256 cells (mostly empty, O(V²)), and scanning a row would cost O(V) even when a node has 3 neighbours. For sparse graphs, the list is the standard correct choice.

**Q2. Why does Dijkstra need a priority queue? What goes wrong without it?**
Dijkstra must always expand the *unvisited node with the smallest tentative distance*. Without a priority queue you'd scan the whole frontier every iteration — O(V) per pop, O(V²) total. With a binary min-heap, push and pop are O(log V), so the whole algorithm drops to O((V + E) log V). On sparse graphs that's a big real win.

**Q3. Why can't Dijkstra handle negative weights?**
Its correctness proof relies on the greedy claim: "when a node is popped with the smallest tentative distance, that distance is final." A negative edge appearing later could create a *cheaper* route to an already-settled node, breaking that claim. That's why negative-cycle graphs need Bellman–Ford instead. My weights are metres, so they're always positive — Dijkstra is safe here.

**Q4. What is "lazy deletion"? Why didn't you implement decrease-key?**
When a node's distance improves, I push a *new* heap entry rather than updating the old one in place. Stale entries are skipped when popped (checked against the settled set and the current best distance). It's slightly more memory (E entries max) but far simpler and the standard practical approach.

**Q5. What makes the A\* heuristic "admissible" — and why did you have to fix your map data for it?**
Admissible = never *overestimates* the true remaining cost. My heuristic is straight-line (Euclidean) distance, and a straight line is the shortest possible walk, so it can never overestimate. That guarantees A\* returns the same optimal distance as Dijkstra. My first draft of the map data had some walkway weights *shorter* than the straight-line distance between endpoints — geometrically impossible and it would have broken admissibility. There's now a test asserting every weight ≥ Euclidean distance between its endpoints.

**Q6. Your A\* uses a "closed set" without reopening nodes. Why is that still optimal?**
Because the heuristic is not just admissible but *consistent*: h(u) ≤ weight(u,v) + h(v) for every edge. With a consistent heuristic, the first time A\* pops a node its g-score is already optimal, so nodes never need reopening. Consistency follows directly from the triangle inequality on Euclidean distance with my edge weights.

**Q7. BFS also finds paths — why isn't it enough?**
BFS treats every edge as equal. It finds the route through the *fewest buildings*, not the *fewest metres*. The demo shows this concretely: BFS's route can be 200+ m longer than Dijkstra's on the same trip. Different problems need different traversals — that comparison is a core point of the project.

**Q8. How does your app know when to say "turn left"?**
At each junction I take the incoming and outgoing direction vectors and compute their 2D cross product. On screen coordinates (y grows downward), a positive cross product means clockwise — a right turn. Near-zero means straight (segments get merged so instructions stay short), and beyond ~145° it's a U-turn. Simple computational geometry on top of the graph.

**Q9. What happens if a walkway is closed and no route exists at all?**
`closeEdge` marks the edge closed on both endpoints, and `neighbours()` filters closed edges out — so the algorithms simply never traverse them. If that disconnects the destination, the frontier drains, the path comes back empty, and the UI shows a clear error ("every path is blocked…") instead of crashing. There are tests for both rerouting and full disconnection.

**Q10. How do you know your code is correct?**
33 dependency-free tests, run with `npm test`. Highlights: an *oracle test* that compares 1,000 interleaved heap operations against a plain array (every pop must equal the true minimum), an *optimality cross-check* asserting A\* and Dijkstra return identical distances and paths on several source–destination pairs, a rerouting test that blocks the optimal route's final hop and verifies the alternative is longer but valid, and disconnection tests. The test suite actually caught two real bugs during development — a wrong test assumption and a Node/browser scoping issue — which is exactly what tests are for.

---

### Bonus feature: the ♿ Step-free profile

**Q11. How does the wheelchair-friendly mode work without duplicating the algorithms?**
Each edge carries a `hasSteps` flag. `neighbours(id, mode)` filters stepped edges out when the mode is `wheelchair`, so Dijkstra, BFS and A\* run *unchanged* on a slightly smaller subgraph — one implementation serving two graphs. This is the classic "visibility/filter" pattern: change what the algorithm can see, not the algorithm.

**Q12. Can step-free mode make a destination unreachable?**
Yes — and that's a feature, not a bug. EC Department connects to the rest of campus through exactly two walkways; one has steps, so in step-free mode it's only reachable via the Sports Complex (1,855 m instead of 715 m — nearly triple). Close the Sports Complex walkway too and there is *no step-free route at all* — the app reports that honestly instead of pretending. A test asserts exactly this.

---

### Bonus rapid-fire
- **Time complexity of your Dijkstra?** O((V + E) log V) with the binary heap; O(V + E) space.
- **Why is the animation not the live computation?** On 16 nodes the algorithms finish in microseconds; the UI replays the *recorded* `visitedOrder` so humans can watch it.
- **Why vanilla JS, no React?** Zero build step, zero cost, instant load — and the evaluator can read every line. The interesting engineering here is the algorithms, not the framework.
- **Biggest limitation?** The map is hand-authored data, not GPS-verified; in a real deployment you'd derive weights from actual paths.

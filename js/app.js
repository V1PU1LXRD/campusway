/**
 * app.js — wires the DSA engine to the "Campus Navigation Lab" interface.
 *
 * Interaction model (unchanged from the original):
 *   - click building A -> set as START
 *   - click building B -> set as DESTINATION and run
 *   - algorithm cards / profile buttons re-run the same trip
 *   - closing walkways reroutes automatically
 *
 * The routing engine calls (buildCampusGraph, dijkstra, aStar, bfsPath,
 * buildDirections) are untouched; everything here is presentation only.
 */
(function () {
  'use strict';

  /* ---------------- model ---------------- */
  const graph = buildCampusGraph();

  /* ---------------- dom ---------------- */
  const $ = (id) => document.getElementById(id);
  const elSource = $('selSource');
  const elTarget = $('selTarget');
  const btnFind = $('btnFind');
  const btnReset = $('btnReset');
  const btnResetHeader = $('btnResetHeader');
  const btnAbout = $('btnAbout');
  const btnAboutClose = $('btnAboutClose');
  const aboutDialog = $('aboutDialog');
  const mapChip = $('mapChip');
  const mapChipText = $('mapChipText');
  const heroWrap = $('heroWrap');
  const statusBar = $('statusBar');
  const statusChip = $('statusChip');
  const statusChipText = $('statusChipText');
  const statusText = $('statusText');
  const resultsEl = $('results');
  const algoListEl = $('algoList');
  const directionsSection = $('directionsSection');
  const directionsEl = $('directions');
  const summarySection = $('summarySection');
  const summaryGrid = $('summaryGrid');
  const whyRouteEl = $('whyRoute');
  const alertBox = $('alertBox');
  const liveEl = $('live');
  const profileNote = $('profileNote');

  /* ---------------- ui helpers ---------------- */
  const fmtDist = (n) => UI.formatMetres(n);
  const fmtMs = (n) => UI.formatMs(n);
  const algoName = (m) => UI.algorithmLabel(m);
  const nameOf = (id) => (graph.getNode(id) ? graph.getNode(id).name : id);

  function announce(msg) {
    liveEl.textContent = msg;
  }

  function showAlert(kind, html) {
    alertBox.className = `alert alert--${kind}`;
    alertBox.innerHTML = html;
    alertBox.hidden = false;
  }
  function hideAlert() {
    alertBox.hidden = true;
  }

  /* ---------------- state ---------------- */
  const state = {
    source: null,
    target: null,
    mode: 'dijkstra',
    profile: 'standard',
    runToken: 0,
    results: null,
  };
  const closedPairs = [];

  /* ---------------- map ---------------- */
  // Visit-ring colors are CSS VARIABLES (see tokens.css) so they re-theme
  // automatically when the user switches between light and dark mode.
  const VISIT_COLORS = {
    dijkstra: 'var(--visit-dijkstra)', // muted blue / lifted blue in dark
    astar: 'var(--visit-astar)',       // restrained violet
    bfs: 'var(--visit-bfs)',           // emerald
  };
  const VISIT_ORDER = Object.keys(VISIT_COLORS);

  const map = new CampusMap($('map'), graph, onNodeClick, (nodeId) => {
    announce(`${nameOf(nodeId)} explored`);
  });

  /* ---------------- status chip + hero collapse ---------------- */
  const CHIP = {
    idle: { text: 'Select a start point', active: false, hint: 'Click a building on the map to begin.' },
    choosing: { text: 'Now choose destination', active: false, hint: '' },
    ready: { text: 'Route ready', active: true, hint: '' },
    error: { text: 'No route', active: false, hint: 'Try a different pair of buildings.' },
  };

  function setChip(kind) {
    const c = CHIP[kind];
    mapChipText.textContent = c.text;
    statusChipText.textContent = c.text;
    statusText.textContent = c.hint;
    mapChip.classList.toggle('chip--active', c.active);
    statusChip.classList.toggle('chip--active', c.active);
  }

  function collapseHero() {
    if (!statusBar.hidden) return;
    heroWrap.classList.add('collapsible--collapsed');
    statusBar.hidden = false;
  }
  function expandHero() {
    heroWrap.classList.remove('collapsible--collapsed');
    statusBar.hidden = true;
  }

  /* ---------------- selection flow ---------------- */
  function updateSelection() {
    for (const [el, id, ph] of [
      [elSource, state.source, 'Click the map…'],
      [elTarget, state.target, '—'],
    ]) {
      el.textContent = id ? nameOf(id) : ph;
      el.classList.toggle('is-placeholder', !id);
    }
    btnFind.disabled = !(state.source && state.target);
  }

  function onNodeClick(id) {
    hideAlert();

    if (!state.source || (state.source && state.target)) {
      state.runToken += 1;
      map.reset();
      state.source = id;
      state.target = null;
      state.results = null;
      map.markSource(id);
      resultsEl.hidden = true;
      directionsSection.hidden = true;
      summarySection.hidden = true;
      setChip('choosing');
      collapseHero();
      announce(`${nameOf(id)} set as start. Now choose a destination.`);
    } else if (id === state.source) {
      showAlert('info', '<strong>Same building.</strong> Start and destination must be different.');
    } else {
      state.target = id;
      map.markTarget(id);
      runRoute(true);
    }
    updateSelection();
  }

  /* ---------------- routing ---------------- */
  function runRoute(animate) {
    if (!state.source || !state.target) return;

    state.runToken += 1;
    const token = state.runToken;
    map.clearRoute();
    map.clearVisits();
    hideAlert();

    // Engine calls — UNCHANGED. The profile is passed through so step-free
    // mode runs the same algorithms on the filtered subgraph.
    const res = {
      dijkstra: dijkstra(graph, state.source, state.target, state.profile),
      astar: aStar(graph, state.source, state.target, state.profile),
      bfs: bfsPath(graph, state.source, state.target, state.profile),
    };
    state.results = res;

    // If the selected algorithm found nothing this run, fall back to one
    // that did (e.g. step-free mode disconnects some trips for BFS first).
    if (!res[state.mode].path.length) {
      const fallback = ALGO_ORDER.find(({ key }) => res[key].path.length);
      if (fallback) state.mode = fallback.key;
    }

    const active = res[state.mode];
    if (!active.path.length) {
      showNoRoute();
      return;
    }

    // Visit rings use the active algorithm's color from the very first frame.
    // The .visit-<mode> class scopes the matching --visit-color variable.
    map.visitColor = VISIT_COLORS[state.mode] || null;
    VISIT_ORDER.forEach((m) => map.svg.classList.toggle(`visit-${m}`, m === state.mode));

    if (!animate || UI.prefersReducedMotion()) {
      finishRoute(active);
      return;
    }

    const order = active.visitedOrder;
    const stepMs = Math.max(30, Math.min(140, Math.round(900 / Math.max(order.length, 1))));
    order.forEach((nodeId, i) => {
      window.setTimeout(() => {
        if (token !== state.runToken) return;
        map.showVisit(nodeId);
      }, i * stepMs);
    });
    window.setTimeout(() => {
      if (token !== state.runToken) return;
      finishRoute(active);
    }, order.length * stepMs + 120);
  }

  function finishRoute(active) {
    map.drawRoute(active.path, true);
    renderAlgoCards(state.results);
    renderDirections(active.path);
    renderSummary(active);
    resultsEl.hidden = false;
    directionsSection.hidden = false;
    summarySection.hidden = false;
    setChip('ready');
    announce(
      `Route found with ${algoName(state.mode)}. ` +
        `${fmtDist(active.distance)}, ${active.visitedCount} nodes explored.`
    );
  }

  function showNoRoute() {
    resultsEl.hidden = true;
    directionsSection.hidden = true;
    summarySection.hidden = true;
    setChip('error');
    const blocked = closedPairs.length > 0 || state.profile === 'wheelchair';
    showAlert(
      'error',
      blocked
        ? '<strong>No route available.</strong> Every usable path to the destination is blocked — try reopening walkways or switching back to the Standard profile.'
        : '<strong>No route exists</strong> between these two buildings (the graph is disconnected there).'
    );
    announce('No route could be found.');
  }

  /* ---------------- Section B: algorithm cards ---------------- */
  const ALGO_ORDER = [
    { key: 'dijkstra', tag: 'Shortest distance', blurb: 'guaranteed shortest on non-negative weights' },
    { key: 'bfs', tag: 'Fewest hops', blurb: 'shortest by number of walkways, not metres' },
    { key: 'astar', tag: 'Heuristic-guided', blurb: 'Dijkstra plus straight-line guidance' },
  ];
  const metricTweens = new Map(); // key: mode -> { metric-key -> tween }

  function tweenFor(mode, metricKey) {
    if (!metricTweens.has(mode)) metricTweens.set(mode, {});
    const bag = metricTweens.get(mode);
    if (!bag[metricKey]) {
      const card = algoListEl.querySelector(`[data-mode="${mode}"]`);
      bag[metricKey] = UI.initMetricTween(card.querySelector(`.metric-${metricKey} .metric-value`));
    }
    return bag[metricKey];
  }

  function buildAlgoCards() {
    algoListEl.replaceChildren();
    for (const { key, tag, blurb } of ALGO_ORDER) {
      const li = document.createElement('li');
      li.className = 'algo-card';
      li.dataset.mode = key;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'algo-card__btn';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(key === state.mode));
      btn.setAttribute('aria-label', `${algoName(key)}, ${tag}: ${blurb}`);

      const top = document.createElement('span');
      top.className = 'algo-card__top';
      top.innerHTML =
        `<span class="algo-card__name">${algoName(key)}</span>` +
        `<span class="algo-card__tag">${tag}</span>` +
        `<span class="algo-card__selected" hidden>` +
        `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-5"/></svg>` +
        `Selected</span>`;

      const metrics = document.createElement('span');
      metrics.className = 'algo-card__metrics';
      metrics.innerHTML =
        `<span class="metric-dist">Distance <strong class="metric-value">–</strong></span>` +
        `<span class="metric-hops">Hops <strong class="metric-value">–</strong></span>` +
        `<span class="metric-nodes">Explored <strong class="metric-value">–</strong></span>` +
        `<span class="metric-time">Compute <strong class="metric-value">–</strong></span>`;

      btn.appendChild(top);
      btn.appendChild(metrics);
      btn.addEventListener('click', () => selectAlgorithm(key));
      li.appendChild(btn);
      algoListEl.appendChild(li);
    }
  }

  function renderAlgoCards(res) {
    for (const { key } of ALGO_ORDER) {
      const r = res[key];
      const card = algoListEl.querySelector(`[data-mode="${key}"]`);
      const sel = key === state.mode;
      card.classList.toggle('is-selected', sel);
      card.querySelector('.algo-card__btn').setAttribute('aria-checked', String(sel));
      card.querySelector('.algo-card__selected').hidden = !sel;

      // Selected card tweens its numbers; others update instantly.
      const setMetric = (metricKey, value) => {
        if (sel) tweenFor(key, metricKey).set(value);
        else card.querySelector(`.metric-${metricKey} .metric-value`).textContent = value;
      };
      setMetric('dist', fmtDist(r.distance));
      setMetric('hops', String(Math.max(r.path.length - 1, 0)));
      setMetric('nodes', String(r.visitedCount));
      setMetric('time', fmtMs(r.timeMs));
    }
  }

  function selectAlgorithm(key) {
    if (key === state.mode && state.results) {
      runRoute(true); // re-select: replay the exploration
      return;
    }
    state.mode = key;
    if (state.results) runRoute(true);
  }

  /* ---------------- roving focus for radio groups ---------------- */
  function bindRoving(container, itemSelector, activate) {
    container.addEventListener('keydown', (e) => {
      const items = Array.from(container.querySelectorAll(itemSelector));
      const idx = items.indexOf(document.activeElement);
      if (idx === -1) return;
      let next = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = items[(idx + 1) % items.length];
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = items[(idx - 1 + items.length) % items.length];
      if (next) {
        e.preventDefault();
        next.focus();
        activate(next);
      }
    });
  }

  /* ---------------- Section C: directions ---------------- */
  function renderDirections(path) {
    const items = buildDirections(graph, path);
    directionsEl.replaceChildren(
      ...items.map((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      })
    );
  }

  /* ---------------- Section D: summary ---------------- */
  function renderSummary(active) {
    const PROFILE = { standard: 'Standard', wheelchair: 'Step-free' };
    const rows = [
      ['Trip', `${nameOf(state.source)} → ${nameOf(state.target)}`],
      ['Algorithm', `${algoName(state.mode)} — ${ALGO_ORDER.find((a) => a.key === state.mode).blurb}`],
      ['Route type', PROFILE[state.profile]],
      ['Distance', fmtDist(active.distance)],
      ['Hops', String(Math.max(active.path.length - 1, 0))],
      ['Nodes explored', String(active.visitedCount)],
      ['Compute time', fmtMs(active.timeMs)],
    ];
    summaryGrid.replaceChildren(
      ...rows.flatMap(([k, v]) => {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        return [dt, dd];
      })
    );
    whyRouteEl.textContent = buildWhyText(active);
  }

  function buildWhyText(active) {
    if (state.profile === 'wheelchair') {
      return `Every walkway on this route is step-free. Avoiding stairs and steep ramps can make the walk longer: ${fmtDist(active.distance)} here versus ${fmtDist(state.results.dijkstra.distance)} for unrestricted Dijkstra.`;
    }
    switch (state.mode) {
      case 'dijkstra':
        return `Dijkstra always settles the closest building first, so this is the guaranteed shortest walk (${fmtDist(active.distance)}) — the baseline the other two are measured against.`;
      case 'bfs':
        return `BFS ignores walkway lengths and minimizes the number of walkways used (${Math.max(active.path.length - 1, 0)} hops). Fewer hops can be easier to follow, but the distance may exceed Dijkstra's ${fmtDist(state.results.dijkstra.distance)}.`;
      case 'astar':
        return `A* is guided by straight-line distance to the destination. It found the same shortest walk (${fmtDist(active.distance)}) while examining ${active.visitedCount} buildings versus Dijkstra's ${state.results.dijkstra.visitedCount}.`;
      default:
        return '';
    }
  }

  /* ---------------- profile toggle ---------------- */
  const steppedCount = graph.steppedEdgeCount();
  const PROFILE_NOTES = {
    standard: `${steppedCount} walkways have steps or steep ramps (dashed amber on the map).`,
    wheelchair: 'Step-free avoids those walkways entirely; some trips may have no step-free route.',
  };

  document.querySelectorAll('.mode-btn[data-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.profile = btn.dataset.profile;
      document
        .querySelectorAll('.mode-btn[data-profile]')
        .forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      profileNote.textContent = PROFILE_NOTES[state.profile];
      if (state.results) runRoute(true);
    });
  });

  bindRoving(document.querySelector('.profile-toggle'), '[role="radio"]', (btn) => {
    if (btn.dataset.profile !== state.profile) btn.click();
  });

  bindRoving(algoListEl, '[role="radio"]', (btn) => {
    const key = btn.closest('[data-mode]').dataset.mode;
    if (key !== state.mode) selectAlgorithm(key);
  });

  /* ---------------- closed walkways ---------------- */
  (function populateEdgeSelect() {
    const seen = new Set();
    const pairs = [];
    for (const id of graph.nodeIds()) {
      for (const e of graph.adj.get(id)) {
        const key = [id, e.to].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([id, e.to]);
      }
    }
    pairs.sort((p, q) => nameOf(p[0]).localeCompare(nameOf(q[0])));
    for (const [a, b] of pairs) {
      const opt = document.createElement('option');
      opt.value = `${a}|${b}`;
      opt.textContent = `${nameOf(a)} ↔ ${nameOf(b)}`;
      $('closedEdge').appendChild(opt);
    }
  })();

  function applyClosed() {
    graph.openAllEdges();
    map.setAllEdgesOpen();
    for (const [a, b] of closedPairs) {
      graph.closeEdge(a, b);
      map.setEdgeClosed(a, b, true);
    }
    renderClosedChips();
    if (state.source && state.target) runRoute(true);
  }

  function renderClosedChips() {
    $('closedChips').replaceChildren(
      ...closedPairs.map(([a, b]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'closed-chip';
        chip.textContent = `${nameOf(a)} ↔ ${nameOf(b)} — reopen`;
        chip.setAttribute('aria-label', `Reopen walkway between ${nameOf(a)} and ${nameOf(b)}`);
        chip.addEventListener('click', () => {
          const idx = closedPairs.findIndex((p) => p[0] === a && p[1] === b);
          if (idx >= 0) closedPairs.splice(idx, 1);
          applyClosed();
        });
        return chip;
      })
    );
  }

  $('btnClose').addEventListener('click', () => {
    const value = $('closedEdge').value;
    if (!value) return;
    const [a, b] = value.split('|');
    if (closedPairs.some((p) => p[0] === a && p[1] === b)) {
      showAlert('info', 'That walkway is already closed.');
      return;
    }
    closedPairs.push([a, b]);
    applyClosed();
  });

  $('btnReopen').addEventListener('click', () => {
    closedPairs.length = 0;
    applyClosed();
  });

  /* ---------------- header + setup actions ---------------- */
  btnFind.addEventListener('click', () => runRoute(true)); // replay for demos

  function resetAll() {
    state.runToken += 1;
    state.source = null;
    state.target = null;
    state.results = null;
    map.reset();
    resultsEl.hidden = true;
    directionsSection.hidden = true;
    summarySection.hidden = true;
    hideAlert();
    updateSelection();
    setChip('idle');
    expandHero();
    announce('Selection cleared.');
  }
  btnReset.addEventListener('click', resetAll);
  btnResetHeader.addEventListener('click', resetAll);

  /* ---------------- dialog ---------------- */
  // (The map legend is a native <details> disclosure below the map — no JS.)
  initDialog({ dialog: aboutDialog, openBtns: [btnAbout], closeBtn: btnAboutClose });

  /* ---------------- theme toggle announcements ---------------- */
  // js/ui/theme.js performs the toggle; here we just narrate it politely.
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      announce(dark ? 'Dark theme enabled.' : 'Light theme enabled.');
    });
  });

  /* ---------------- init ---------------- */
  buildAlgoCards();
  updateSelection();
  setChip('idle');
  profileNote.textContent = PROFILE_NOTES.standard;
  $('algoMeta').textContent = `${graph.nodeIds().length} buildings · ${graph.edgeCount()} walkways`;
  announce('CampusWay ready. Click a building to set your start point.');
})();

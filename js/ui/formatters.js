/**
 * ui/formatters.js — small presentation helpers.
 * Nothing here touches routing logic; these only format values for display.
 */
(function () {
  'use strict';

  /** True when the user asked the OS to reduce motion. */
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Attach tween behaviour to a metric element. Usage:
   *   const m = UI.initMetricTween(el);
   *   m.set('1,310 m');   // brief fade/slide when the value changes
   */
  function initMetricTween(el) {
    let current = el.textContent;
    return {
      set(next) {
        if (next === current) return;
        current = next;
        if (prefersReducedMotion()) {
          el.textContent = next;
          return;
        }
        el.classList.add('is-updating');
        window.setTimeout(() => {
          el.textContent = next;
          el.classList.remove('is-updating');
        }, 140);
      },
    };
  }

  /** Metres: 1310 -> "1,310 m"; not finite -> em dash. */
  function formatMetres(n) {
    return Number.isFinite(n) ? `${Math.round(n).toLocaleString('en-IN')} m` : '—';
  }

  /** Milliseconds: 0.0521 -> "0.05 ms". */
  function formatMs(n) {
    return `${n.toFixed(2)} ms`;
  }

  /** Public name for the mode used in text/ARIA. */
  function algorithmLabel(mode) {
    return { dijkstra: 'Dijkstra', astar: 'A*', bfs: 'BFS' }[mode] || mode;
  }

  const API = { prefersReducedMotion, initMetricTween, formatMetres, formatMs, algorithmLabel };

  // Browser global; also exportable for the Node test runner.
  if (typeof window !== 'undefined') window.UI = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();

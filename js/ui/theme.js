/**
 * ui/theme.js — light/dark theme toggle.
 *
 * Strategy:
 *  - A 3-line inline script in <head> applies the theme BEFORE first paint
 *    (prevents a light flash for dark-OS users). This module only toggles.
 *  - Persistence in localStorage under "campusway-theme" (guarded: storage
 *    can throw in some privacy modes).
 *  - Fallback chain: saved choice -> OS prefers-color-scheme -> light.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'campusway-theme';
  const root = document.documentElement;

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;

    // Keep the browser UI (address bar) color in sync.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f1420' : '#f5f7fa');

    // Sync the toggle buttons (header) if present.
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
  }

  function savedTheme() {
    try {
      const t = localStorage.getItem(STORAGE_KEY);
      return t === 'dark' || t === 'light' ? t : null;
    } catch {
      return null; // privacy mode / storage disabled
    }
  }

  function store(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* non-fatal: theme just won't persist */
    }
  }

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function toggle() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    apply(next);
    store(next);
  }

  function init() {
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.addEventListener('click', toggle);
    });
    apply(currentTheme()); // normalize label/aria state on load

    // Follow OS changes only while the user hasn't chosen explicitly.
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = (e) => {
        if (!savedTheme()) apply(e.matches ? 'dark' : 'light');
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange); // older Safari
    }
  }

  const API = { toggle, apply, currentTheme };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Browser global + Node export (harmless in tests).
  if (typeof window !== 'undefined') window.ThemeManager = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();

/**
 * ui/dialog.js — accessible modal helper built on the native <dialog> element.
 *
 * Native <dialog>.showModal() already gives us: focus trapping, Escape to
 * close, inert page background. This helper adds: closing on backdrop click
 * and returning focus to the trigger button.
 */
(function () {
  'use strict';

  function initDialog({ dialog, openBtns, closeBtn }) {
    let lastTrigger = null;

    function open(trigger) {
      lastTrigger = trigger || null;
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', ''); // ancient-browser fallback
      }
    }

    function close() {
      dialog.close();
    }

    openBtns.forEach((btn) => {
      btn.addEventListener('click', () => open(btn));
    });
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Escape is handled natively; 'close' fires for it too.
    dialog.addEventListener('close', () => {
      if (lastTrigger && typeof lastTrigger.focus === 'function') {
        lastTrigger.focus();
      }
      lastTrigger = null;
    });

    // Backdrop click: clicks on ::backdrop land on the <dialog> itself.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });

    return { open, close };
  }

  window.initDialog = initDialog;
})();

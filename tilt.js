/* Lightweight 3D tilt effect — applies perspective rotation + a light glare
   that follows the pointer. Skips itself on touch devices and when the
   visitor has requested reduced motion. */
(function () {
  'use strict';
  function initTilt(selector, opts) {
    const els = document.querySelectorAll(selector);
    if (!els.length) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasHover = window.matchMedia('(hover: hover)').matches;
    if (prefersReduced || !hasHover) return;
    const max = (opts && opts.max) || 8;
    const scale = (opts && opts.scale) || 1.015;
    els.forEach((el) => {
      el.classList.add('tilt');
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform =
          `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) ` +
          `rotateY(${(px * max).toFixed(2)}deg) scale(${scale})`;
        el.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
        el.style.setProperty('--my', `${(py + 0.5) * 100}%`);
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  }
  window.initTilt = initTilt;
})();

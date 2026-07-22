/* Home page logic: nav menu, active-link tracking, scroll reveal,
   hero language bar + typing effect, and 3D tilt wiring for cards. */
(function () {
  'use strict';

  /* NAV ------------------------------------------------------------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const navAnchors = document.querySelectorAll('[data-nav]');
  const sections = Array.from(navAnchors)
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = '#' + entry.target.id;
          const link = document.querySelector(`[data-nav][href="${id}"]`);
          if (!link) return;
          if (entry.isIntersecting) {
            navAnchors.forEach((a) => a.classList.remove('active'));
            link.classList.add('active');
          }
        });
      },
      { rootMargin: '-40% 0px -50% 0px' }
    );
    sections.forEach((s) => sectionObserver.observe(s));
  }

  /* SCROLL REVEAL ----------------------------------------------------- */
  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealItems.forEach((i) => io.observe(i));
  } else {
    revealItems.forEach((i) => i.classList.add('in'));
  }

  /* HERO: language spectrum bar ---------------------------------------- */
  (function langBar() {
    const bar = document.getElementById('langBar');
    if (!bar) return;
    const langs = [
      { n: 'Python', w: 22, c: 'var(--blue)' },
      { n: 'JavaScript', w: 18, c: 'var(--gold)' },
      { n: 'Java', w: 12, c: 'var(--violet)' },
      { n: 'Go', w: 9, c: 'var(--green)' },
      { n: 'Rust', w: 8, c: 'var(--pink)' },
      { n: 'C++', w: 7, c: 'var(--red)' },
      { n: 'TypeScript', w: 6, c: 'var(--blue)' },
      { n: 'Ruby', w: 5, c: 'var(--red)' },
      { n: 'C#', w: 5, c: 'var(--green)' },
      { n: 'Other 51', w: 8, c: 'var(--muted)' },
    ];
    langs.forEach((l) => {
      const s = document.createElement('span');
      s.style.width = l.w + '%';
      s.style.background = l.c;
      s.title = l.n;
      bar.appendChild(s);
    });
  })();

  /* HERO: typing effect ------------------------------------------------ */
  (function typedTerminal() {
    const el = document.getElementById('typedOut');
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = 'Hello, world!';
      return;
    }
    const text = 'Hello, world!';
    let i = 0;
    function type() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(type, 70);
      }
    }
    setTimeout(type, 900);
  })();

  /* 3D TILT ------------------------------------------------------------ */
  if (window.initTilt) {
    window.initTilt('.about-card', { max: 7, scale: 1.02 });
    window.initTilt('.team-card', { max: 8, scale: 1.03 });
    window.initTilt('.feat-card', { max: 6, scale: 1.02 });
    window.initTilt('.stat', { max: 6, scale: 1.02 });
  }
})();

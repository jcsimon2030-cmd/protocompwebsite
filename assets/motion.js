// ProtoComp motion layer — scroll-reveal choreography, a "living" product
// console, and pointer micro-interactions. Vanilla JS, no dependencies.
//
// Accessibility contract: hidden/animated states are applied ONLY after we add
// `js-motion` to <html>, and only when the user has NOT asked to reduce motion.
// With JS off or reduced-motion on, every element renders in its final state.
(function () {
  'use strict';

  var root = document.documentElement;
  var motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var io = 'IntersectionObserver' in window;

  // ── number count-up ───────────────────────────────────────────────
  function fmt(v, decimals) {
    if (decimals > 0) return v.toFixed(decimals);
    return Math.round(v).toLocaleString('en-US');
  }
  function render(el, v) {
    var d = parseInt(el.dataset.decimals || '0', 10);
    el.textContent = (el.dataset.prefix || '') + fmt(v, d) + (el.dataset.suffix || '');
  }
  function countUp(el, dur) {
    var target = parseFloat(el.dataset.count);
    if (isNaN(target)) return;
    if (motionMQ.matches) { render(el, target); return; }
    var t0 = performance.now();
    (function tick(now) {
      var p = Math.min((now - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      render(el, target * e);
      if (p < 1) requestAnimationFrame(tick);
      else render(el, target);
    })(t0);
  }

  // ── scroll reveal ─────────────────────────────────────────────────
  function setupReveal() {
    var sel = [
      '.section-head',
      '.feature-row > *',
      '.grid-2 > .card',
      '.does-col',
      '.bullets li',
      'section > .container > .lead'
    ].join(',');

    // Exclude anything inside the hero (it gets its own intro).
    var nodes = [].slice.call(document.querySelectorAll(sel))
      .filter(function (n) { return !n.closest('.hero'); });

    // Stagger siblings that share a parent.
    var seen = new Map();
    nodes.forEach(function (n) {
      n.classList.add('reveal');
      var p = n.parentElement;
      var i = seen.get(p) || 0;
      n.style.setProperty('--d', (i * 70) + 'ms');
      seen.set(p, i + 1);
    });

    if (!io) { nodes.forEach(function (n) { n.classList.add('is-visible'); }); return; }

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-visible');
        obs.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    nodes.forEach(function (n) { obs.observe(n); });
  }

  // ── hero intro (above the fold, runs on load) ─────────────────────
  function setupHeroIntro() {
    var copy = document.querySelector('.hero-copy');
    var console_ = document.querySelector('.hero .console');
    var items = [];
    if (copy) items = items.concat([].slice.call(copy.children));
    if (console_) items.push(console_);

    items.forEach(function (n, i) {
      n.classList.add('intro');
      n.style.setProperty('--d', (120 + i * 90) + 'ms');
    });
    // Next frame so the initial (hidden) state paints first.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        items.forEach(function (n) { n.classList.add('intro-in'); });
      });
    });
  }

  // ── living console ────────────────────────────────────────────────
  // Counts values up when the console scrolls in, then keeps a slow
  // "recompute" loop running so the dashboard feels alive.
  function setupLivingConsole() {
    var consoles = [].slice.call(document.querySelectorAll('.console'));
    consoles.forEach(function (c) {
      var nums = [].slice.call(c.querySelectorAll('[data-count]'));

      function activate() {
        c.classList.add('is-live');
        nums.forEach(function (el) { countUp(el, 1100); });
      }

      if (c.closest('.hero')) {
        // Hero console is visible immediately.
        activate();
      } else if (io) {
        var once = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            activate();
            once.unobserve(en.target);
          });
        }, { threshold: 0.4 });
        once.observe(c);
      } else {
        activate();
      }
    });

    if (motionMQ.matches) return; // no recompute loop under reduced motion

    // Readiness drifts on the hero console; one adjusted row pulses with it.
    var readiness = document.querySelector('[data-readiness]');
    var driftRow = document.querySelector('[data-recompute]');
    if (!readiness) return;
    var seq = [72, 74, 71, 73, 70, 75];
    var idx = 0;

    setInterval(function () {
      if (document.hidden) return;
      var hostConsole = readiness.closest('.console');
      if (hostConsole) {
        var bar = hostConsole.querySelector('.console-bar');
        if (bar) { bar.classList.remove('sweep'); void bar.offsetWidth; bar.classList.add('sweep'); }
      }
      idx = (idx + 1) % seq.length;
      readiness.dataset.count = String(seq[idx]);
      countUp(readiness, 900);
      if (driftRow) {
        driftRow.classList.remove('flash'); void driftRow.offsetWidth; driftRow.classList.add('flash');
      }
    }, 6500);
  }

  // ── pointer micro-interactions ────────────────────────────────────
  function setupMicro() {
    if (motionMQ.matches || !window.matchMedia('(pointer: fine)').matches) return;

    // Magnetic primary buttons.
    [].slice.call(document.querySelectorAll('.btn-primary, .nav-cta')).forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var mx = (e.clientX - r.left) / r.width - 0.5;
        var my = (e.clientY - r.top) / r.height - 0.5;
        btn.style.transform = 'translate(' + (mx * 6).toFixed(1) + 'px,' + (my * 5 - 1).toFixed(1) + 'px)';
      });
      btn.addEventListener('pointerleave', function () { btn.style.transform = ''; });
    });

    // Cursor spotlight on cards.
    [].slice.call(document.querySelectorAll('.card')).forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      });
    });
  }

  function boot() {
    root.classList.add('js-motion');
    if (!motionMQ.matches) {
      setupHeroIntro();
      setupReveal();
    } else {
      // Reduced motion: reveal everything, no intro choreography.
      root.classList.add('motion-reduced');
    }
    setupLivingConsole();
    setupMicro();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

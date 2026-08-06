// ProtoComp — scroll-film engine for /landing.
//
// Scroll scrubs an ffmpeg-extracted WebP frame sequence on a full-viewport
// canvas while chapter panels choreograph over it, then the film hands off to
// the page content below.
//
// Core mechanics (in order of how much they matter):
//   1. ImageBitmap sliding window  — decodes off the main thread around the
//      playhead so every draw is a pure GPU blit (this is the anti-jank core;
//      drawImage(HTMLImageElement) forces a SYNCHRONOUS decode on first paint).
//   2. Lerped playhead             — scroll sets a target, the frame eases to
//      it, which is what makes scrubbing feel like film instead of a slider.
//   3. Non-blocking loader         — reveals after a short head of frames; the
//      rest stream in behind a concurrency-capped pump, with nearestFrame()
//      covering anything not loaded yet.
(function () {
  'use strict';

  var FRAME_COUNT = 217;
  // Film resolves just before the final chapter so the ring holds under it.
  // (Anything near 2.0 freezes the back half of the scroll on one still.)
  var FRAME_SPEED = 1.08;
  var IMAGE_SCALE = 0.94;
  var BG = '#04060a';
  var HEAD = 14;        // frames required before the page is revealed
  var IN_FLIGHT = 10;   // concurrent image requests
  var B_AHEAD = 18;     // bitmaps decoded either side of the playhead
  var B_KEEP = 28;      // bitmaps retained before eviction
  var DPR_CAP = 1.5;

  var framePath = function (i) {
    return '/assets/landing/frames/frame_' + ('000' + (i + 1)).slice(-4) + '.webp';
  };

  var canvas = document.getElementById('canvas');
  var scrollContainer = document.getElementById('scroll-container');
  if (!canvas || !scrollContainer || !window.gsap || !window.ScrollTrigger) return;

  var ctx = canvas.getContext('2d', { alpha: false });
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  gsap.registerPlugin(ScrollTrigger);

  var canvasWrap = document.querySelector('.canvas-wrap');
  var hero = document.querySelector('.hero-standalone');
  var overlay = document.getElementById('dark-overlay');
  var loader = document.getElementById('loader');
  var loaderBar = document.getElementById('loader-bar');
  var loaderPct = document.getElementById('loader-percent');

  var images = new Array(FRAME_COUNT);
  var loaded = new Array(FRAME_COUNT);
  var bitmaps = new Map();
  var decoding = new Set();
  var bmpCenter = -999;
  var targetFrame = 0;
  var playhead = 0;
  var displayed = -1;

  // ── drawing ─────────────────────────────────────────────────
  function nearestFrame(i) {
    if (loaded[i]) return i;
    for (var d = 1; d < FRAME_COUNT; d++) {
      if (i - d >= 0 && loaded[i - d]) return i - d;
      if (i + d < FRAME_COUNT && loaded[i + d]) return i + d;
    }
    return -1;
  }

  function drawFrame(i) {
    var src = bitmaps.get(i);
    if (!src) {
      var n = nearestFrame(i);
      if (n < 0) return;
      src = bitmaps.get(n) || images[n];
    }
    if (!src) return;
    var cw = canvas.width, ch = canvas.height;
    var iw = src.width || src.naturalWidth, ih = src.height || src.naturalHeight;
    if (!iw || !ih) return;
    var scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE;
    var dw = iw * scale, dh = ih * scale;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(src, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  // Decode a window of frames off-thread; evict far ones so memory stays flat.
  function ensureBitmaps(center) {
    if (!window.createImageBitmap) return;
    if (Math.abs(center - bmpCenter) < 3) return;
    bmpCenter = center;
    var lo = Math.max(0, center - B_AHEAD);
    var hi = Math.min(FRAME_COUNT - 1, center + B_AHEAD);
    for (var i = lo; i <= hi; i++) {
      if (bitmaps.has(i) || decoding.has(i) || !loaded[i]) continue;
      decoding.add(i);
      (function (i) {
        createImageBitmap(images[i]).then(function (b) {
          decoding.delete(i);
          if (Math.abs(i - bmpCenter) > B_KEEP) { b.close(); return; }
          bitmaps.set(i, b);
          if (i === displayed) drawFrame(i);
        }).catch(function () { decoding.delete(i); });
      })(i);
    }
    bitmaps.forEach(function (b, k) {
      if (k < center - B_KEEP || k > center + B_KEEP) { b.close(); bitmaps.delete(k); }
    });
  }

  // ── sizing ──────────────────────────────────────────────────
  var lastW = 0, lastH = 0;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    lastW = window.innerWidth; lastH = window.innerHeight;
    drawFrame(Math.round(playhead));
  }

  // Mobile URL-bar show/hide fires resize with an unchanged width. Refreshing
  // ScrollTrigger there recomputes every trigger mid-scroll and stutters, so
  // only a real width change triggers a full refresh, and it's debounced.
  var resizeTimer = 0;
  function onResize() {
    var wChanged = window.innerWidth !== lastW;
    var hDelta = Math.abs(window.innerHeight - lastH);
    if (!wChanged && hDelta < 120) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (wChanged) ScrollTrigger.refresh();
    }, 150);
  }

  // ── loading ─────────────────────────────────────────────────
  var doneCount = 0;
  function setLoad(frac) {
    if (loaderBar) loaderBar.style.width = Math.round(frac * 100) + '%';
    if (loaderPct) loaderPct.textContent = Math.round(frac * 100) + '%';
  }
  function loadFrame(i) {
    return new Promise(function (res) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () { loaded[i] = true; doneCount++; res(); };
      im.onerror = function () { doneCount++; res(); };
      im.src = framePath(i);
      images[i] = im;
    });
  }
  // Concurrency-capped pump — 205 parallel requests starve the connection pool
  // and delay the frames actually needed next.
  function pump(from, to) {
    var next = from;
    function run() {
      if (next > to) return Promise.resolve();
      var i = next++;
      return loadFrame(i).then(function () {
        setLoad(doneCount / FRAME_COUNT);
        return run();
      });
    }
    var lanes = [];
    for (var k = 0; k < IN_FLIGHT; k++) lanes.push(run());
    return Promise.all(lanes);
  }

  // ── chapter choreography ────────────────────────────────────
  var sections = [];
  function buildTimeline(section, type) {
    var inner = section.querySelector('.section-inner');
    var kids = section.querySelectorAll('.section-label, .section-heading, .section-body, .section-note, .cta-button, .stat');
    var tl = gsap.timeline({ paused: true });
    var d = reduce ? 0.001 : 0.85, st = reduce ? 0 : 0.12;
    // The panel itself animates, so an inactive chapter leaves no empty box.
    var p = { opacity: 0, duration: reduce ? 0.001 : 0.7, ease: 'power3.out' };
    switch (type) {
      case 'slide-left':  p.x = -80; break;
      case 'slide-right': p.x = 80; break;
      case 'scale-up':    p.scale = 0.92; p.transformOrigin = '50% 50%'; break;
      case 'rotate-in':   p.y = 40; p.rotation = 2; break;
      case 'clip-reveal': p.y = 40; p.scale = 0.96; p.transformOrigin = '50% 100%'; break;
      default:            p.y = 50;
    }
    if (inner) tl.from(inner, p);
    tl.from(kids, { y: 20, opacity: 0, stagger: st, duration: d, ease: 'power3.out' }, '-=0.35');
    return tl;
  }

  function setupSections() {
    [].forEach.call(document.querySelectorAll('.scroll-section'), function (section) {
      var cfg = {
        el: section,
        enter: parseFloat(section.dataset.enter) / 100,
        leave: parseFloat(section.dataset.leave) / 100,
        persist: section.dataset.persist === 'true',
        tl: buildTimeline(section, section.dataset.animation),
        state: 'pre',
        onIn: null,
      };
      if (section.classList.contains('section-stats')) cfg.onIn = makeCounters(section);
      sections.push(cfg);
    });
  }

  function updateSection(s, p) {
    var inWin = p >= s.enter && p <= s.leave;
    if (inWin || (p > s.leave && s.persist)) {
      if (s.state !== 'in') {
        s.state = 'in';
        s.el.style.visibility = 'visible';
        s.tl.timeScale(1).play();
        if (s.onIn) { s.onIn(); s.onIn = null; }
      }
    } else if (s.state !== 'out') {
      s.state = 'out';
      s.tl.timeScale(1.8).reverse();
    }
  }

  function makeCounters(section) {
    return function () {
      [].forEach.call(section.querySelectorAll('.stat-number'), function (el) {
        var target = parseFloat(el.dataset.value);
        var dec = parseInt(el.dataset.decimals || '0', 10);
        if (reduce) { el.textContent = target.toFixed(dec); return; }
        var o = { v: 0 };
        gsap.to(o, {
          v: target, duration: 2, ease: 'power1.out',
          onUpdate: function () { el.textContent = o.v.toFixed(dec); },
          onComplete: function () { el.textContent = target.toFixed(dec); },
        });
      });
    };
  }

  // ── hero wipe + stats overlay ───────────────────────────────
  function initHero() {
    if (!hero) return;
    if (reduce) { if (canvasWrap) canvasWrap.style.clipPath = 'none'; return; }
    ScrollTrigger.create({
      trigger: hero, start: 'top top', end: 'bottom top', scrub: true,
      onUpdate: function (self) {
        var p = self.progress;
        hero.style.opacity = 1 - p;
        if (canvasWrap) canvasWrap.style.clipPath = 'circle(' + Math.min(1, p * 1.25) * 82 + '% at 50% 50%)';
      },
    });
  }

  var ov = { enter: 0.64, leave: 0.78 };
  function updateOverlay(p) {
    if (!overlay) return;
    var fr = 0.04, o = 0;
    if (p >= ov.enter - fr && p <= ov.enter) o = (p - (ov.enter - fr)) / fr;
    else if (p > ov.enter && p < ov.leave) o = 0.9;
    else if (p >= ov.leave && p <= ov.leave + fr) o = 0.9 * (1 - (p - ov.leave) / fr);
    overlay.style.opacity = o;
  }

  function setupMarquee() {
    [].forEach.call(document.querySelectorAll('.marquee-wrap'), function (el) {
      var speed = parseFloat(el.dataset.scrollSpeed) || -28;
      var text = el.querySelector('.marquee-text');
      if (text && !reduce) {
        gsap.to(text, {
          xPercent: speed, ease: 'none',
          scrollTrigger: { trigger: scrollContainer, start: 'top top', end: 'bottom bottom', scrub: true },
        });
      }
    });
  }

  // ── master driver ───────────────────────────────────────────
  var onStage = true;
  var raf = 0;

  function applyProgress(p) {
    targetFrame = Math.min(p * FRAME_SPEED, 1) * (FRAME_COUNT - 1);
    updateOverlay(p);
    for (var i = 0; i < sections.length; i++) updateSection(sections[i], p);
    var mq = document.querySelector('.marquee-wrap');
    if (mq) mq.style.opacity = (p > 0.12 && p < 0.9) ? 0.5 : 0;
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!onStage) return;
    // Lerped playhead: scroll sets the target, the frame eases toward it.
    playhead += (targetFrame - playhead) * 0.14;
    if (Math.abs(targetFrame - playhead) < 0.01) playhead = targetFrame;
    var idx = Math.round(playhead);
    ensureBitmaps(idx);
    if (idx !== displayed) { displayed = idx; drawFrame(idx); }
  }

  function start() {
    resize();
    window.addEventListener('resize', onResize, { passive: true });

    var JUMP = new URLSearchParams(location.search).get('jump');
    if (JUMP !== null) history.scrollRestoration = 'manual';

    if (!reduce && window.Lenis && JUMP === null) {
      var lenis = new Lenis({
        duration: 1.2,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true,
      });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    }

    setupSections();
    setupMarquee();
    initHero();

    if (!reduce && JUMP === null) {
      gsap.from('.hero-heading .word', { yPercent: 60, opacity: 0, stagger: 0.08, duration: 1, ease: 'power4.out', delay: 0.15 });
      gsap.from('.hero-standalone .section-label, .hero-tagline, .scroll-indicator', { y: 24, opacity: 0, stagger: 0.12, duration: 0.9, ease: 'power3.out', delay: 0.5 });
    }

    ScrollTrigger.create({
      trigger: scrollContainer, start: 'top top', end: 'bottom bottom', scrub: true,
      onUpdate: function (self) { applyProgress(self.progress); },
    });

    // Stop painting once the film stage is scrolled past (content covers it).
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { onStage = e[0].isIntersecting; }, { threshold: 0 })
        .observe(scrollContainer);
    }

    if (loader) loader.classList.add('done');
    ScrollTrigger.refresh();

    if (reduce) {
      // Static representative frame, no scrubbing loop.
      playhead = targetFrame = Math.round((FRAME_COUNT - 1) * 0.72);
      ensureBitmaps(Math.round(playhead));
      drawFrame(Math.round(playhead));
      [].forEach.call(document.querySelectorAll('.scroll-section'), function (el) {
        el.style.visibility = 'visible';
      });
    } else {
      tick();
    }

    // Dev contract for the screenshot/jank harness.
    if (JUMP !== null) {
      window.scrollTo(0, +JUMP || 0);
      ScrollTrigger.update();
      var r = scrollContainer.getBoundingClientRect();
      var denom = r.height - window.innerHeight;
      applyProgress(denom > 0 ? Math.max(0, Math.min(1, -r.top / denom)) : 0);
      playhead = targetFrame;
      var jidx = Math.round(playhead);
      ensureBitmaps(jidx);
      displayed = jidx;
      drawFrame(jidx);
    }
    window.__ready = true;
  }

  // Reveal after a short head of frames; the rest stream in behind.
  pump(0, Math.min(HEAD, FRAME_COUNT) - 1).then(function () {
    ensureBitmaps(0);
    drawFrame(0);
    start();
    if (HEAD < FRAME_COUNT) pump(HEAD, FRAME_COUNT - 1);
  });
})();

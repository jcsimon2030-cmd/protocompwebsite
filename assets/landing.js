// ProtoComp — premium scroll-driven video landing engine.
// Lenis smooth scroll + GSAP/ScrollTrigger. Scroll position scrubs an
// ffmpeg-extracted WebP frame sequence on a full-viewport canvas, while
// side-aligned text sections choreograph in with varied entrances.
(function () {
  'use strict';

  var FRAME_COUNT = 217;
  var FRAME_SPEED = 2.0;     // product animation resolves by ~50% scroll
  var IMAGE_SCALE = 0.94;    // padded cover
  var BG = '#04060a';
  var framePath = function (i) {
    return '/assets/landing/frames/frame_' + ('000' + (i + 1)).slice(-4) + '.webp';
  };

  var canvas = document.getElementById('canvas');
  var scrollContainer = document.getElementById('scroll-container');
  if (!canvas || !scrollContainer || !window.gsap || !window.ScrollTrigger) return;

  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  gsap.registerPlugin(ScrollTrigger);

  var canvasWrap = document.querySelector('.canvas-wrap');
  var hero = document.querySelector('.hero-standalone');
  var overlay = document.getElementById('dark-overlay');
  var loader = document.getElementById('loader');
  var loaderBar = document.getElementById('loader-bar');
  var loaderPct = document.getElementById('loader-percent');

  // ── canvas sizing (DPR-aware) ───────────────────────────────
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    drawFrame(currentFrame);
  }

  var frames = new Array(FRAME_COUNT);
  var currentFrame = 0;

  function drawFrame(i) {
    var img = frames[i];
    if (!img || !img.naturalWidth) return;
    var cw = canvas.width, ch = canvas.height;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE;
    var dw = iw * scale, dh = ih * scale;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  // ── two-phase preloader ─────────────────────────────────────
  function loadFrame(i) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = im.onerror = function () { res(); };
      im.src = framePath(i);
      frames[i] = im;
    });
  }
  function setLoad(frac) {
    if (loaderBar) loaderBar.style.width = Math.round(frac * 100) + '%';
    if (loaderPct) loaderPct.textContent = Math.round(frac * 100) + '%';
  }
  async function preload() {
    var head = Math.min(12, FRAME_COUNT);
    for (var i = 0; i < head; i++) { await loadFrame(i); setLoad((i + 1) / FRAME_COUNT); }
    drawFrame(0);
    var done = head;
    var rest = [];
    for (var j = head; j < FRAME_COUNT; j++) {
      rest.push(loadFrame(j).then(function () { done++; setLoad(done / FRAME_COUNT); }));
    }
    await Promise.all(rest);
  }

  // ── section choreography ────────────────────────────────────
  var sections = [];
  function buildTimeline(section, type) {
    var inner = section.querySelector('.section-inner');
    var kids = section.querySelectorAll('.section-label, .section-heading, .section-body, .section-note, .cta-button, .stat');
    var tl = gsap.timeline({ paused: true });
    var d = reduce ? 0.001 : 0.85, st = reduce ? 0 : 0.12;
    // The whole glass panel fades+moves with the section, so an inactive section
    // shows NOTHING (no lingering empty box). Children then stagger inside it.
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

  // ── counters ────────────────────────────────────────────────
  function makeCounters(section) {
    return function () {
      [].forEach.call(section.querySelectorAll('.stat-number'), function (el) {
        var target = parseFloat(el.dataset.value);
        var dec = parseInt(el.dataset.decimals || '0', 10);
        if (reduce) { el.textContent = target.toFixed(dec); return; }
        gsap.fromTo(el, { textContent: 0 }, {
          textContent: target, duration: 2, ease: 'power1.out',
          snap: { textContent: dec === 0 ? 1 : 0.01 },
          onUpdate: function () {
            el.textContent = parseFloat(el.textContent).toFixed(dec);
          },
        });
      });
    };
  }

  // ── hero circle-wipe + dark overlay ─────────────────────────
  // The hero fades and the canvas circle-wipes in across the hero's own scroll.
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

  // ── marquee ─────────────────────────────────────────────────
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
      ScrollTrigger.create({
        trigger: scrollContainer, start: 'top top', end: 'bottom bottom', scrub: true,
        onUpdate: function (self) {
          var p = self.progress;
          el.style.opacity = (p > 0.12 && p < 0.9) ? 0.5 : 0;
        },
      });
    });
  }

  // ── master scroll driver ────────────────────────────────────
  function start() {
    if (loader) loader.classList.add('done');
    resize();
    window.addEventListener('resize', function () { resize(); ScrollTrigger.refresh(); }, { passive: true });

    if (!reduce && window.Lenis) {
      var lenis = new Lenis({ duration: 1.2, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    }
    setupSections();
    setupMarquee();
    initHero();

    if (!reduce) {
      gsap.from('.hero-heading .word', { yPercent: 60, opacity: 0, stagger: 0.08, duration: 1, ease: 'power4.out', delay: 0.15 });
      gsap.from('.hero-standalone .section-label, .hero-tagline, .scroll-indicator', { y: 24, opacity: 0, stagger: 0.12, duration: 0.9, ease: 'power3.out', delay: 0.5 });
    }

    ScrollTrigger.create({
      trigger: scrollContainer, start: 'top top', end: 'bottom bottom', scrub: true,
      onUpdate: function (self) {
        var p = self.progress;
        var idx = Math.min(Math.floor(Math.min(p * FRAME_SPEED, 1) * FRAME_COUNT), FRAME_COUNT - 1);
        if (idx !== currentFrame) { currentFrame = idx; requestAnimationFrame(function () { drawFrame(idx); }); }
        updateOverlay(p);
        for (var i = 0; i < sections.length; i++) updateSection(sections[i], p);
      },
    });
    ScrollTrigger.refresh();
  }

  preload().then(start);
})();

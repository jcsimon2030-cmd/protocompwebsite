// Scroll-driven frame player for the landing page.
// Preloads the ffmpeg-extracted frame sequence, then maps page scroll position
// through the story section onto a frame index drawn to a canvas. Reduced-motion
// shows a single representative frame and skips scrubbing.
(function () {
  'use strict';

  var N = 144; // frame count (assets/landing/frames/frame-0001.jpg …)
  var canvas = document.querySelector('.lp-canvas');
  var section = document.querySelector('.lp-story');
  if (!canvas || !section) return;

  var ctx = canvas.getContext('2d');
  var loader = document.querySelector('.lp-loader');
  var chapters = [].slice.call(document.querySelectorAll('.lp-chapter'));
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function pad(n) { return ('000' + n).slice(-4); }
  function src(i) { return '/assets/landing/frames/frame-' + pad(i + 1) + '.jpg'; }

  var imgs = new Array(N);
  var loaded = 0;
  var cur = -1;

  function draw(i) {
    i = i < 0 ? 0 : (i > N - 1 ? N - 1 : i | 0);
    if (i === cur) return;
    var im = imgs[i];
    if (im && im.complete && im.naturalWidth) {
      ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
      cur = i;
    }
  }

  function progress() {
    var r = section.getBoundingClientRect();
    var denom = r.height - window.innerHeight;
    if (denom <= 0) return 0;
    var p = -r.top / denom;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  function render() {
    var p = progress();
    draw(Math.round(p * (N - 1)));
    var st = Math.floor(p * 4);
    if (st > 3) st = 3; if (st < 0) st = 0;
    for (var k = 0; k < chapters.length; k++) {
      chapters[k].classList.toggle('is-active', k === st);
    }
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { render(); ticking = false; });
  }

  function setLoad(pct) { if (loader) loader.style.setProperty('--p', pct + '%'); }

  function start() {
    if (loader) loader.classList.add('done');
    // size the canvas backing store to the frame's natural resolution
    var first = imgs[0];
    if (first && first.naturalWidth) {
      canvas.width = first.naturalWidth;
      canvas.height = first.naturalHeight;
    }
    if (reduce) {
      draw(Math.round(0.16 * (N - 1)));
      if (chapters[0]) chapters[0].classList.add('is-active');
      return;
    }
    render();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  // Preload every frame; start once all are in (errors count too, so a missing
  // frame never deadlocks the loader).
  for (var i = 0; i < N; i++) {
    (function (i) {
      var im = new Image();
      im.onload = im.onerror = function () {
        loaded++;
        setLoad(Math.round((loaded / N) * 100));
        if (loaded === N) start();
      };
      im.src = src(i);
      imgs[i] = im;
    })(i);
  }
})();

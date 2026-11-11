/* Forma Studio: start-up. Runs the loader and brings in Three.js only when
   the browser can actually use it. */
(function () {
  'use strict';

  var F = window.FORMA = window.FORMA || {};
  var doc = document, root = doc.documentElement;

  var THREE_URLS = [
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js'
  ];
  var threePromise = null;
  F.loadThree = function () {
    if (!threePromise) {
      threePromise = import(THREE_URLS[0]).catch(function () { return import(THREE_URLS[1]); });
    }
    return threePromise;
  };
  F.hasWebGL = function () {
    try {
      var c = doc.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  };

  function warn(what, err) { if (window.console && console.warn) console.warn('[forma] ' + what, err); }
  function byId(id) { return doc.getElementById(id); }

  function boot() {
    clearTimeout(window.__formaFailsafe);

    var num = byId('loaderNum'), hero = byId('hero'), video = byId('heroVideo');
    var t0 = performance.now(), MAX = 3000, MIN = 700;
    var weights = { fonts: 0.2, video: 0.3, scene: 0.5 }, state = { fonts: 0, video: 0, scene: 0 };
    var shown = 0, finished = false, hero3d = null;

    function done(k) { state[k] = 1; }
    function finish() {
      if (finished) return;
      finished = true;
      if (num) num.textContent = '100';
      root.classList.add('is-loaded');
      if (F.startReveal) F.startReveal();
      if (F.kickScroll) F.kickScroll();
      setTimeout(function () { if (hero3d) hero3d.enter(); }, 260);
    }
    function tick(now) {
      if (finished) return;
      var el = now - t0, target = 0, k;
      for (k in state) target += state[k] * weights[k];
      if (el >= MAX) target = 1;
      target = Math.max(target, Math.min(0.88, el / MAX));   /* keeps moving while it waits */
      shown += Math.max(0.004, (target - shown) * 0.16);
      if (shown > target) shown = target;
      if (num) num.textContent = String(Math.round(shown * 100));
      if (shown >= 0.995 && el >= MIN) { finish(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    setTimeout(finish, MAX + 1500);   /* background tabs do not run animation frames */

    /* what the loader waits for */
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { done('fonts'); }, function () { done('fonts'); });
    else done('fonts');

    if (video) {
      video.muted = true;
      if (video.readyState >= 2) done('video');
      else {
        video.addEventListener('loadeddata', function () { done('video'); }, { once: true });
        video.addEventListener('error', function () { done('video'); }, { once: true });
      }
    } else done('video');

    var isFile = location.protocol === 'file:';
    var can3d = !isFile && F.hasWebGL();
    if (isFile) { var note = byId('fileNote'); if (note) note.hidden = false; }

    /* ---------- 3D phone ---------- */

    if (can3d && hero && F.initHero) {
      F.initHero({
        section: hero, canvas: byId('heroCanvas'), anchor: byId('heroPhone'), video: video,
        showcase: F.showcase, hint: byId('heroHint'),
        poster: 'assets/santino-screen.webp',
        sites: [
          { kind: 'video' },
          { kind: 'scroll', src: 'assets/dc-scroll.webp' },
          { kind: 'scroll', src: 'assets/nk-scroll.webp' }
        ]
      }).then(function (api) {
        hero3d = api; done('scene');
        if (finished) api.enter();
      }).catch(function (err) {
        warn('3D hero is off:', err);
        done('scene');
        if (hero) hero.classList.remove('has-3d');
        if (F.fallbackShowcase) F.fallbackShowcase();
      });
    } else {
      done('scene');
      if (F.fallbackShowcase) F.fallbackShowcase();
    }

    /* ---------- 3D ring (starts a bit before it scrolls into view) ---------- */

    var ringSec = byId('gallery'), ringStage = byId('ringStage'), grid = byId('ringGrid');
    var ringWork = byId('ringWork'), ringCap = byId('ringCap');

    /* plain grid: shown until the ring is ready, and instead of it without WebGL */
    if (grid && !grid.childElementCount && F.shots) {
      F.shots.forEach(function (s) {
        var b = doc.createElement('button');
        b.type = 'button'; b.className = 'shot'; b.setAttribute('data-shot', s.id);
        var im = doc.createElement('img');
        im.loading = 'lazy'; im.decoding = 'async'; im.draggable = false;
        im.alt = s.alt; im.width = s.w; im.height = s.h; im.src = s.src;
        b.appendChild(im); grid.appendChild(b);
      });
    }

    if (can3d && ringSec && ringStage && F.initRing && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        F.initRing({
          section: ringSec, stage: ringStage, canvas: byId('ringCanvas'), shots: F.shots || [],
          onOpen: function (id) { if (F.lightbox) F.lightbox.open(id, ringStage); },
          onActive: function (s) {
            if (ringWork) ringWork.textContent = s.work;
            if (ringCap) ringCap.textContent = s.cap;
          }
        }).then(function (api) {
          var prev = byId('ringPrev'), next = byId('ringNext');
          if (prev) prev.addEventListener('click', function () { api.step(-1); });
          if (next) next.addEventListener('click', function () { api.step(1); });
        }).catch(function (err) {
          warn('3D ring is off:', err);
          ringSec.classList.remove('has-3d');
        });
      }, { rootMargin: '900px 0px' });
      io.observe(ringSec);
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

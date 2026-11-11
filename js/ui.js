/* Forma Studio: interface behaviour. No 3D in this file. */
(function () {
  'use strict';

  var F = window.FORMA = window.FORMA || {};
  var doc = document, root = doc.documentElement;

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mq(q) { return window.matchMedia ? window.matchMedia(q).matches : false; }

  F.$ = $; F.$$ = $$; F.clamp = clamp;
  F.reduced = mq('(prefers-reduced-motion: reduce)');
  F.fine = mq('(hover: hover) and (pointer: fine)');
  F.coarse = mq('(pointer: coarse)');
  F.menuOpen = false;

  /* ---------- one scroll listener for everything ---------- */

  var scrollFns = [], ticking = false;
  function runScroll() {
    ticking = false;
    var y = window.scrollY || root.scrollTop || 0, vh = window.innerHeight;
    for (var i = 0; i < scrollFns.length; i++) scrollFns[i](y, vh);
  }
  function kick() { if (!ticking) { ticking = true; requestAnimationFrame(runScroll); } }
  F.onScroll = function (fn) { scrollFns.push(fn); };
  F.kickScroll = kick;
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);

  /* ---------- header: hide on the way down, show on the way up ---------- */

  function initHeader() {
    var header = $('#siteHeader'), bar = $('#progressBar');
    if (!header) return;
    var lastY = 0;
    F.onScroll(function (y, vh) {
      header.classList.toggle('is-stuck', y > 8);
      var max = Math.max(1, root.scrollHeight - vh);
      if (bar) bar.style.transform = 'scaleX(' + clamp(y / max, 0, 1).toFixed(4) + ')';
      if (!F.menuOpen) {
        if (y > lastY + 6 && y > 320) header.classList.add('is-hidden');
        else if (y < lastY - 6 || y <= 320) header.classList.remove('is-hidden');
      }
      if (Math.abs(y - lastY) > 6) lastY = y;
    });
    header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });
  }

  /* ---------- full-screen menu on phones ---------- */

  function initMenu() {
    var burger = $('#burger'), menu = $('#menu'), header = $('#siteHeader');
    if (!burger || !menu) return;
    function set(open) {
      F.menuOpen = open;
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
      root.classList.toggle('is-locked', open);
      if (header) { header.classList.toggle('is-menu', open); if (open) header.classList.remove('is-hidden'); }
      kick();
    }
    burger.addEventListener('click', function () {
      set(!F.menuOpen);
      if (F.menuOpen) { var first = $('a', menu); if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 60); }
    });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && F.menuOpen) { set(false); burger.focus(); } });
    if (window.matchMedia) {
      var wide = window.matchMedia('(min-width: 861px)');
      var onWide = function (e) { if (e.matches && F.menuOpen) set(false); };
      if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
    }
  }

  /* ---------- reveal on scroll (content stays visible without JS) ---------- */

  F.startReveal = function () {
    if (F.reduced || !('IntersectionObserver' in window)) return;
    var els = $$('.reveal');
    root.classList.add('reveal-ready');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
  };

  /* ---------- magnetic buttons (mouse only) ---------- */

  function initMagnetic() {
    if (!F.fine || F.reduced) return;
    $$('.magnetic').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
        var y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
        el.style.setProperty('--mx', (clamp(x, -1, 1) * 8).toFixed(2) + 'px');
        el.style.setProperty('--my', (clamp(y, -1, 1) * 6).toFixed(2) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--mx', '0px'); el.style.setProperty('--my', '0px');
      });
    });
  }

  /* ---------- tilt of screenshot frames (mouse only) ---------- */

  function initTilt() {
    if (!F.fine || F.reduced) return;
    $$('.tilt').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = clamp((e.clientX - r.left) / r.width, 0, 1), py = clamp((e.clientY - r.top) / r.height, 0, 1);
        var max = clamp(2400 / r.width, 2.2, 8);
        el.style.setProperty('--ry', ((px - 0.5) * max).toFixed(2) + 'deg');
        el.style.setProperty('--rx', ((0.5 - py) * max * 0.8).toFixed(2) + 'deg');
        el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
        el.classList.add('is-tilting');
      });
      el.addEventListener('pointerleave', function () {
        el.classList.remove('is-tilting');
        el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------- Santino strip: arrows, progress, mouse drag ---------- */

  function initStrip() {
    var track = $('#santinoTrack');
    if (!track) return;
    var prev = $('#santinoPrev'), next = $('#santinoNext'), bar = $('#santinoProgress');

    function stepSize() {
      var card = track.children[1] || track.children[0];
      var gap = parseFloat(getComputedStyle(track).columnGap) || 16;
      return (card.getBoundingClientRect().width + gap) * (window.innerWidth < 700 ? 1 : 2);
    }
    function sync() {
      var max = track.scrollWidth - track.clientWidth;
      var p = max > 0 ? clamp(track.scrollLeft / max, 0, 1) : 1;
      if (bar) bar.style.setProperty('--p', (0.12 + 0.88 * p).toFixed(4));
      if (prev) prev.disabled = track.scrollLeft < 4;
      if (next) next.disabled = max - track.scrollLeft < 4;
    }
    var syncQueued = false;
    track.addEventListener('scroll', function () {
      if (syncQueued) return; syncQueued = true;
      requestAnimationFrame(function () { syncQueued = false; sync(); });
    }, { passive: true });
    window.addEventListener('resize', sync);
    var beh = F.reduced ? 'auto' : 'smooth';
    if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -stepSize(), behavior: beh }); });
    if (next) next.addEventListener('click', function () { track.scrollBy({ left: stepSize(), behavior: beh }); });
    sync();

    /* mouse drag with a little glide; touch keeps native scrolling */
    var down = false, dragging = false, sx = 0, sl = 0, lastX = 0, lastT = 0, vx = 0, raf = 0, block = false;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; dragging = false; sx = lastX = e.clientX; sl = track.scrollLeft; lastT = e.timeStamp; vx = 0;
      cancelAnimationFrame(raf);
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx;
      if (!dragging && Math.abs(dx) > 5) { dragging = true; track.classList.add('is-dragging'); }
      if (!dragging) return;
      track.scrollLeft = sl - dx;
      var dt = e.timeStamp - lastT;
      if (dt > 0) vx = 0.7 * vx + 0.3 * ((e.clientX - lastX) / dt);
      lastX = e.clientX; lastT = e.timeStamp;
    });
    function up() {
      if (!down) return;
      down = false;
      if (!dragging) return;
      dragging = false; block = true;
      setTimeout(function () { block = false; }, 80);
      var v = F.reduced ? 0 : vx * 16;
      (function glide() {
        if (Math.abs(v) < 0.4) { track.classList.remove('is-dragging'); return; }
        track.scrollLeft -= v; v *= 0.94;
        raf = requestAnimationFrame(glide);
      })();
    }
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    track.addEventListener('click', function (e) { if (block) { e.preventDefault(); e.stopPropagation(); } }, true);
    track.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* ---------- Santino video card ---------- */

  function initReel() {
    var reel = $('#reel'), v = $('#reelVideo'), btn = $('#reelToggle'), bar = $('#reelBar');
    if (!reel || !v || !btn) return;
    var userPaused = F.reduced, raf = 0;
    v.muted = true;
    function play() { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    function loop() {
      if (v.duration && bar) bar.style.setProperty('--p', (v.currentTime / v.duration).toFixed(4));
      raf = requestAnimationFrame(loop);
    }
    v.addEventListener('play', function () {
      reel.classList.add('is-playing'); btn.setAttribute('aria-label', 'Поставити відео на паузу');
      cancelAnimationFrame(raf); loop();
    });
    v.addEventListener('pause', function () {
      reel.classList.remove('is-playing'); btn.setAttribute('aria-label', 'Відтворити відео');
      cancelAnimationFrame(raf);
    });
    btn.addEventListener('click', function () {
      if (v.paused) { userPaused = false; play(); } else { userPaused = true; v.pause(); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        var seen = es[0].isIntersecting && es[0].intersectionRatio >= 0.55;
        if (seen && !userPaused) play(); else if (!seen && !v.paused) v.pause();
      }, { threshold: [0, 0.55, 1] }).observe(reel);
    }
  }

  /* ---------- soft parallax for the phone frames ---------- */

  function initParallax() {
    if (F.reduced) return;
    var els = $$('[data-parallax]');
    if (!els.length) return;
    F.onScroll(function (y, vh) {
      var amp = window.innerWidth < 761 ? 30 : 100;
      for (var i = 0; i < els.length; i++) {
        var el = els[i], r = el.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        var c = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.translate = '0 ' + (c * parseFloat(el.getAttribute('data-parallax')) * amp).toFixed(1) + 'px';
      }
    });
  }

  /* ---------- "how I work": the line fills, squares turn into circles ---------- */

  function initProcess() {
    var list = $('#steps');
    if (!list) return;
    var items = $$('li', list);
    if (F.reduced) {
      list.style.setProperty('--p', '1');
      items.forEach(function (li) { li.classList.add('is-on'); });
      return;
    }
    F.onScroll(function (y, vh) {
      var r = list.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      var vertical = getComputedStyle(list).getPropertyValue('--vertical').trim() === '1';
      var p = vertical
        ? clamp((vh * 0.7 - r.top) / Math.max(1, r.height), 0, 1)
        : clamp((vh * 0.88 - r.top) / (vh * 0.5), 0, 1);
      list.style.setProperty('--p', p.toFixed(4));
      for (var i = 0; i < items.length; i++) {
        var at = vertical ? items[i].offsetTop / Math.max(1, r.height) : items[i].offsetLeft / Math.max(1, r.width);
        items[i].classList.toggle('is-on', p > at + 0.012 || (i === 0 && p > 0.02));
      }
    });
  }

  /* ---------- copy the Telegram nick ---------- */

  function initCopy() {
    var btn = $('#copyNick'), val = $('#nickVal'), msg = $('#copyMsg');
    if (!btn || !val) return;
    var timer = 0;
    function say(text) {
      if (msg) msg.textContent = text;
      btn.classList.add('is-done');
      clearTimeout(timer);
      timer = setTimeout(function () { if (msg) msg.textContent = ''; btn.classList.remove('is-done'); }, 2000);
    }
    function selectNick() {
      try {
        var range = doc.createRange(); range.selectNodeContents(val);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      } catch (e) {}
    }
    btn.addEventListener('click', function () {
      var text = (val.textContent || '').trim();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { say('Скопійовано'); }, function () { selectNick(); say('Нік виділено, скопіюйте його'); });
      } else { selectNick(); say('Нік виділено, скопіюйте його'); }
    });
  }

  /* ---------- lightbox ---------- */

  function initLightbox() {
    var dlg = $('#lightbox'), img = $('#lbImg'), cap = $('#lbCap'), count = $('#lbCount'), stage = $('#lbStage'), zoomBtn = $('#lbZoom');
    var shots = F.shots = [], byId = F.shotById = {};
    $$('[data-shot]').forEach(function (el) {
      var id = el.getAttribute('data-shot');
      if (byId[id]) return;
      var im = $('img', el);
      if (!im) return;
      var s = {
        id: id, src: im.getAttribute('src'),
        w: +im.getAttribute('width') || 0, h: +im.getAttribute('height') || 0,
        alt: im.getAttribute('alt') || '',
        work: el.getAttribute('data-work') || '', cap: el.getAttribute('data-cap') || ''
      };
      byId[id] = s; shots.push(s);
    });
    F.lightbox = { open: function () {}, close: function () {} };
    if (!dlg || typeof dlg.showModal !== 'function' || !shots.length) return;

    var cur = 0, opener = null, token = 0, swiped = false;

    function isZoomed() { return dlg.classList.contains('is-zoomed'); }
    function setZoom(on) {
      var s = shots[cur];
      if (on) dlg.style.setProperty('--zw', Math.min(s.w, Math.max(stage.clientWidth * 2.2, 900)) + 'px');
      dlg.classList.toggle('is-zoomed', on);
      zoomBtn.setAttribute('aria-pressed', String(on));
      zoomBtn.setAttribute('aria-label', on ? 'Зменшити' : 'Збільшити');
      if (on) { stage.scrollTop = 0; stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2); }
    }
    function checkZoom() {
      var s = shots[cur], shown = img.getBoundingClientRect().width;
      var can = shown > 0 && s.w > shown * 1.2;
      dlg.classList.toggle('no-zoom', !can);
      zoomBtn.disabled = !can;
    }
    function show(i) {
      cur = (i % shots.length + shots.length) % shots.length;
      var s = shots[cur], my = ++token;
      setZoom(false);
      img.classList.add('is-swap');
      var pre = new Image();
      pre.onload = pre.onerror = function () {
        if (my !== token) return;
        img.src = s.src; img.alt = s.alt;
        img.setAttribute('width', s.w); img.setAttribute('height', s.h);
        img.classList.remove('is-swap');
        requestAnimationFrame(checkZoom);
      };
      pre.src = s.src;
      cap.firstElementChild.textContent = s.work;
      cap.lastElementChild.textContent = s.cap;
      count.textContent = (cur + 1) + ' / ' + shots.length;
      (new Image()).src = shots[(cur + 1) % shots.length].src;
    }
    function open(id, from) {
      var s = byId[id];
      if (!s) return;
      opener = from || doc.activeElement;
      root.classList.add('is-locked');
      if (!dlg.open) dlg.showModal();
      show(shots.indexOf(s));
      var closeBtn = $('#lbClose');
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    }
    function close() { if (dlg.open) dlg.close(); }

    doc.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-shot]') : null;
      if (!el || dlg.contains(el)) return;
      e.preventDefault();
      open(el.getAttribute('data-shot'), el);
    });
    $('#lbClose').addEventListener('click', close);
    $('#lbPrev').addEventListener('click', function () { show(cur - 1); });
    $('#lbNext').addEventListener('click', function () { show(cur + 1); });
    zoomBtn.addEventListener('click', function () { setZoom(!isZoomed()); });
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      if (swiped || dlg.classList.contains('no-zoom')) return;
      setZoom(!isZoomed());
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target === stage) close(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { show(cur - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { show(cur + 1); e.preventDefault(); }
    });
    dlg.addEventListener('close', function () {
      root.classList.remove('is-locked');
      dlg.classList.remove('is-zoomed');
      if (opener && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (err) {} }
      opener = null;
    });
    window.addEventListener('resize', function () { if (dlg.open && !isZoomed()) checkZoom(); });

    /* swipe left / right */
    var px = 0, py = 0, pid = null;
    stage.addEventListener('pointerdown', function (e) { px = e.clientX; py = e.clientY; pid = e.pointerId; swiped = false; });
    stage.addEventListener('pointerup', function (e) {
      if (e.pointerId !== pid || isZoomed()) return;
      var dx = e.clientX - px, dy = e.clientY - py;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        swiped = true;
        show(cur + (dx < 0 ? 1 : -1));
        setTimeout(function () { swiped = false; }, 120);
      }
    });

    F.lightbox = { open: open, close: close };
  }

  /* ---------- which nav link is current ---------- */

  function initSpy() {
    if (!('IntersectionObserver' in window)) return;
    var map = {};
    $$('.nav a').forEach(function (a) { map[(a.getAttribute('href') || '').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { var a = map[e.target.id]; if (a) a.classList.toggle('is-current', e.isIntersecting); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var s = doc.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- floating "write" button on phones ---------- */

  function initFab() {
    var fab = $('#fab'), hero = $('#hero'), contact = $('#contact'), header = $('#siteHeader');
    if (!fab || !hero || !contact) return;
    F.onScroll(function (y, vh) {
      var past = y > hero.offsetHeight * 0.7;
      var near = contact.getBoundingClientRect().top < vh * 0.85;
      /* the header carries the same button, so show this one only while the header is away */
      var headerUp = header && !header.classList.contains('is-hidden');
      fab.classList.toggle('is-on', past && !near && !F.menuOpen && !headerUp);
    });
  }

  /* ---------- chips under the hero phone ---------- */

  function initShowcase() {
    var box = $('#showcase');
    if (!box) return;
    var chips = $$('.chip', box), cap = $('#heroCaption'), cur = 0, handler = null;
    function set(i) {
      cur = i;
      chips.forEach(function (c, k) {
        var on = k === i;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', String(on));
        c.style.setProperty('--p', '0');
      });
      if (cap) cap.textContent = chips[i].getAttribute('data-caption') || '';
    }
    chips.forEach(function (c, k) {
      c.addEventListener('click', function () { if (handler) handler(k); else set(k); });
    });
    F.showcase = {
      set: set,
      progress: function (p) { chips[cur].style.setProperty('--p', clamp(p, 0, 1).toFixed(3)); },
      onSelect: function (fn) { handler = fn; },
      count: chips.length
    };
  }

  /* Without WebGL the chips switch plain media inside the CSS phone. */
  F.fallbackShowcase = function () {
    var media = $$('.cssphone__media'), video = $('#heroVideo');
    if (!F.showcase) return;
    F.showcase.onSelect(function (i) {
      F.showcase.set(i);
      media.forEach(function (m, k) { m.classList.toggle('is-on', k === i); });
      if (!video) return;
      if (i === 0 && !F.reduced) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      else video.pause();
    });
  };

  /* The interface starts on its own, so it works even if the 3D part fails. */
  function init() {
    var parts = [initHeader, initMenu, initShowcase, initMagnetic, initTilt, initStrip, initReel,
      initParallax, initProcess, initCopy, initLightbox, initSpy, initFab];
    for (var i = 0; i < parts.length; i++) {
      try { parts[i](); } catch (e) { if (window.console && console.warn) console.warn('[forma] ui part failed:', e); }
    }
    kick();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();

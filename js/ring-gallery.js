/* Forma Studio: 3D ring of screens. Drag to turn, click a screen to open it. */
(function () {
  'use strict';

  var F = window.FORMA = window.FORMA || {};
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function wrapPi(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }

  /* Colours stay in sRGB from texture to screen, so the screenshots look
     exactly like the files. */
  var VERT = [
    'varying vec2 vUv;',
    'varying float vDepth;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vDepth = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var FRAG = [
    'uniform sampler2D map;',
    'uniform float uAspect;',
    'uniform float uRadius;',
    'uniform float uHover;',
    'uniform float uReady;',
    'uniform vec3 uBg;',
    'uniform vec3 uTint;',
    'uniform float uNear;',
    'uniform float uFar;',
    'varying vec2 vUv;',
    'varying float vDepth;',
    'float sdBox(vec2 p, vec2 b, float r) {',
    '  vec2 q = abs(p) - b + r;',
    '  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;',
    '}',
    'void main() {',
    '  vec2 uv = vUv;',
    '  float back = gl_FrontFacing ? 0.0 : 1.0;',
    '  uv.x = mix(uv.x, 1.0 - uv.x, back);',              /* readable from inside the ring too */
    '  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);',
    '  float d = sdBox(p, vec2(uAspect * 0.5, 0.5), uRadius);',
    '  float aa = max(fwidth(d), 0.0005) * 1.25;',
    '  float alpha = 1.0 - smoothstep(-aa, 0.0, d);',
    '  if (alpha < 0.004) discard;',
    '  vec3 col = mix(uTint, texture2D(map, uv).rgb, uReady);',
    '  float edge = smoothstep(-0.016, -0.002, d);',
    '  col = mix(col, col + vec3(0.09), edge * 0.55);',     /* thin light rim */
    '  col *= 0.9 + 0.1 * uHover;',
    '  float fk = smoothstep(uNear, uFar, vDepth);',
    '  float dim = clamp(fk * 0.78 + back * 0.1, 0.0, 0.86) * (1.0 - 0.45 * uHover);',
    /* far screens grow darker and fade out, so the page background shows through them */
    '  col = mix(col, uBg, dim * 0.55);',
    '  gl_FragColor = vec4(col, alpha * (1.0 - dim * 0.72));',
    '}'
  ].join('\n');

  /* portrait and landscape screens alternate around the ring */
  var ORDER = ['nk-hero', 'santino-hero', 'dc-hero', 'santino-day', 'nk-apply', 'santino-dishes', 'dc-mobile',
    'dc-works', 'santino-wine', 'nk-admin', 'santino-events', 'nk-units', 'nk-mobile', 'santino-form',
    'dc-order', 'santino-sent', 'nk-about', 'santino-devices', 'nk-news'];

  F.initRing = function (o) {
    return F.loadThree().then(function (THREE) { return build(THREE, o); });
  };

  function build(THREE, o) {
    var section = o.section, stage = o.stage, canvas = o.canvas;
    var reduced = !!F.reduced, coarse = !!F.coarse;

    var byId = {}, list = [];
    o.shots.forEach(function (s) { byId[s.id] = s; });
    ORDER.forEach(function (id) { if (byId[id]) { list.push(byId[id]); delete byId[id]; } });
    Object.keys(byId).forEach(function (id) { list.push(byId[id]); });
    var n = list.length;
    if (!n) throw new Error('no shots');

    var css = getComputedStyle(document.documentElement);
    var bgHex = (css.getPropertyValue('--bg') || '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(bgHex)) bgHex = '#0E1311';
    var bgInt = parseInt(bgHex.slice(1), 16);
    var bgVec = new THREE.Vector3((bgInt >> 16 & 255) / 255, (bgInt >> 8 & 255) / 255, (bgInt & 255) / 255);
    var tintVec = new THREE.Vector3(0.11, 0.145, 0.13);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    var aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.5, 160);
    var ring = new THREE.Group(); scene.add(ring);

    /* ---------- panels ---------- */

    var H = 2, GAP = 0.34, total = 0;
    list.forEach(function (s) { total += H * s.w / s.h + GAP; });
    var R = total / TAU;

    var uNear = { value: 1 }, uFar = { value: 2 };
    var panels = [], meshes = [], a = 0;
    list.forEach(function (s) {
      var w = H * s.w / s.h, ang = w / R;
      var geo = new THREE.CylinderGeometry(R, R, H, Math.max(6, Math.ceil(ang / 0.06)), 1, true, -ang / 2, ang);
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: null }, uAspect: { value: s.w / s.h }, uRadius: { value: 0.055 },
          uHover: { value: 0 }, uReady: { value: 0 }, uBg: { value: bgVec }, uTint: { value: tintVec },
          uNear: uNear, uFar: uFar
        },
        vertexShader: VERT, fragmentShader: FRAG,
        side: THREE.DoubleSide, transparent: true, forceSinglePass: true, extensions: { derivatives: true }
      });
      var mesh = new THREE.Mesh(geo, mat);
      var center = a + ang / 2;
      mesh.rotation.y = center;
      a += ang + GAP / R;
      var p = { shot: s, mesh: mesh, mat: mat, angle: center, hover: 0, ready: false, readyK: 0 };
      mesh.userData.panel = p;
      ring.add(mesh); panels.push(p); meshes.push(mesh);
    });

    /* textures: load a few at a time, the ones facing the viewer first */
    var rot = -panels[0].angle;
    function loadPanel(p, done) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        var land = p.shot.w >= p.shot.h;
        var maxW = (land ? 800 : 432) * (coarse ? 0.8 : 1);
        var s = Math.min(1, maxW / img.naturalWidth);
        var c = document.createElement('canvas');
        c.width = Math.max(2, Math.round(img.naturalWidth * s));
        c.height = Math.max(2, Math.round(img.naturalHeight * s));
        var x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(img, 0, 0, c.width, c.height);
        var t = new THREE.CanvasTexture(c);
        t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
        p.mat.uniforms.map.value = t; p.ready = true;
        done();
      };
      img.onerror = done;
      img.src = p.shot.src;
    }
    (function () {
      var queue = panels.slice().sort(function (p, q) { return Math.abs(wrapPi(p.angle + rot)) - Math.abs(wrapPi(q.angle + rot)); });
      var busy = 0;
      (function next() {
        while (busy < 3 && queue.length) { busy++; loadPanel(queue.shift(), function () { busy--; next(); }); }
      })();
    })();

    /* ---------- camera ---------- */

    var dist = 8, pxPerUnit = 100;
    function layout() {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
      renderer.setSize(w, h, false);
      var aspect = w / h, narrow = aspect < 1.3;
      var fov = narrow ? 36 : 30, frac = narrow ? 0.44 : 0.46;
      var tan = Math.tan(fov * Math.PI / 360);
      dist = H / (2 * tan * frac);
      var camD = R + dist;
      var camY = 1 + dist / R + 0.55;                      /* high enough to see the far side over the near one */
      var aNear = Math.atan2(-H / 2 - camY, dist), aFar = Math.atan2(H / 2 - camY, camD + R);
      var pitch = (aNear + aFar) / 2;
      camera.fov = fov; camera.aspect = aspect;
      camera.position.set(0, camY, camD);
      camera.lookAt(0, camY + Math.tan(pitch) * camD, 0);
      camera.updateProjectionMatrix();
      pxPerUnit = h / (2 * tan * Math.sqrt(dist * dist + camY * camY));
      uNear.value = dist + R * 0.35; uFar.value = camD + R * 1.05;
    }
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(stage);
    else window.addEventListener('resize', layout);

    /* ---------- interaction ---------- */

    var vel = 0, dragOn = false, pid = null, lx = 0, lt = 0, moved = 0, downT = 0;
    var hoverEvt = null, hoverPanel = null, inside = false, focused = false, idleT = 0, tween = null, active = -1;
    var ray = new THREE.Raycaster(), v2 = new THREE.Vector2();

    function pick(e) {
      var r = canvas.getBoundingClientRect();
      v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v2, camera);
      var hits = ray.intersectObjects(meshes, false);
      return hits.length ? hits[0].object.userData.panel : null;
    }
    function setHover(p) {
      if (p === hoverPanel) return;
      hoverPanel = p;
      stage.classList.toggle('is-pointing', !!p);
    }

    stage.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      dragOn = true; pid = e.pointerId; lx = e.clientX; lt = e.timeStamp; moved = 0; downT = e.timeStamp; vel = 0; tween = null;
      try { stage.setPointerCapture(pid); } catch (err) {}
    });
    stage.addEventListener('pointermove', function (e) {
      if (dragOn && e.pointerId === pid) {
        var dx = e.clientX - lx, dtm = Math.max(1, e.timeStamp - lt) / 1000;
        lx = e.clientX; lt = e.timeStamp; moved += Math.abs(dx);
        var dr = dx / (R * pxPerUnit);
        ring.rotation.y = rot += dr;
        vel = 0.6 * vel + 0.4 * clamp(dr / dtm, -4, 4);
        if (moved > 6) { stage.classList.add('is-dragging'); setHover(null); }
      } else if (e.pointerType === 'mouse') {
        hoverEvt = { clientX: e.clientX, clientY: e.clientY };
      }
    });
    function up(e) {
      if (!dragOn || (e && e.pointerId !== pid)) return;
      dragOn = false; idleT = 0;
      stage.classList.remove('is-dragging');
      if (reduced) vel = 0;
      if (e && e.type === 'pointerup' && moved < 7 && e.timeStamp - downT < 600) {
        var p = pick(e);
        if (p) { vel = 0; if (o.onOpen) o.onOpen(p.shot.id); }
      }
    }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') inside = true; });
    stage.addEventListener('pointerleave', function () { inside = false; hoverEvt = null; setHover(null); });
    stage.addEventListener('focus', function () { focused = true; });
    stage.addEventListener('blur', function () { focused = false; });

    function goTo(i) {
      i = (i % n + n) % n;
      var to = rot + wrapPi(-panels[i].angle - rot);
      vel = 0; idleT = 0;
      if (reduced) { rot = to; tween = null; } else tween = { from: rot, to: to, t: 0, dur: 0.75 };
    }
    function step(d) { goTo((active < 0 ? 0 : active) + d); }
    stage.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
      else if ((e.key === 'Enter' || e.key === ' ') && active >= 0) { if (o.onOpen) o.onOpen(panels[active].shot.id); e.preventDefault(); }
    });

    /* ---------- frame ---------- */

    function update(dt) {
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / tween.dur);
        rot = tween.from + (tween.to - tween.from) * (1 - Math.pow(1 - tween.t, 3));
        if (tween.t >= 1) tween = null;
        idleT = 0;
      } else if (!dragOn) {
        rot += vel * dt;
        vel *= Math.exp(-dt * 2.4);
        if (Math.abs(vel) < 0.002) vel = 0;
        idleT += dt;
        if (!reduced && !inside && !focused) rot -= 0.05 * smooth(coarse ? 2.5 : 0.8, coarse ? 4.5 : 2.4, idleT) * dt;
      }
      ring.rotation.y = rot;

      if (hoverEvt && !dragOn) setHover(pick(hoverEvt));

      var best = -1, bestD = 9;
      for (var i = 0; i < n; i++) {
        var p = panels[i], d = Math.abs(wrapPi(p.angle + rot));
        if (d < bestD) { bestD = d; best = i; }
        p.hover += ((p === hoverPanel ? 1 : 0) - p.hover) * (1 - Math.exp(-dt * 10));
        p.readyK += ((p.ready ? 1 : 0) - p.readyK) * (1 - Math.exp(-dt * 5));
        p.mat.uniforms.uHover.value = p.hover;
        p.mat.uniforms.uReady.value = p.readyK;
        var s = 1 + p.hover * 0.035;
        p.mesh.scale.set(s, s, s);
      }
      if (best !== active) { active = best; if (o.onActive) o.onActive(panels[best].shot); }
    }

    var running = false, raf = 0, last = 0, inView = false, tabOn = !document.hidden, lost = false;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = clamp((now - last) / 1000, 0.001, 0.05); last = now;
      update(dt);
      renderer.render(scene, camera);
    }
    function sync() {
      var on = inView && tabOn && !lost;
      if (on && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!on && running) { running = false; cancelAnimationFrame(raf); }
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { inView = es[0].isIntersecting; sync(); }, { rootMargin: '150px 0px' }).observe(stage);
    } else inView = true;
    document.addEventListener('visibilitychange', function () { tabOn = !document.hidden; sync(); });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault(); lost = true; sync();
      section.classList.remove('has-3d');
    });

    section.classList.add('has-3d');
    layout();
    update(0.016);
    renderer.render(scene, camera);
    sync();

    return { step: step, goTo: goTo };
  }
})();

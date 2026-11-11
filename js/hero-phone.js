/* Forma Studio: the 3D phone in the hero.
   Its screen plays a real screen recording (video texture) and scrolls two
   real mobile screenshots. Three.js core only, no add-ons. */
(function () {
  'use strict';

  var F = window.FORMA = window.FORMA || {};
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function wrapPi(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function damp(cur, target, k, dt) { return cur + (target - cur) * (1 - Math.exp(-k * dt)); }

  /* rounded rectangle centred on the origin */
  function rrShape(THREE, w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }

  /* ShapeGeometry puts raw x/y into uv; stretch them to 0..1 */
  function remapUV(geo, w, h) {
    var p = geo.attributes.position, uv = geo.attributes.uv;
    for (var i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
    uv.needsUpdate = true;
  }

  /* ExtrudeGeometry is faceted. Average the normals of the side faces that
     meet at a small angle so the metal rim reads as one smooth surface. */
  function smoothSides(THREE, geo, creaseDeg) {
    var pos = geo.attributes.position, nor = geo.attributes.normal, grp = null, i;
    for (i = 0; i < geo.groups.length; i++) if (geo.groups[i].materialIndex === 1) grp = geo.groups[i];
    if (!grp) return;
    var cos = Math.cos(creaseDeg * Math.PI / 180), map = {};
    var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), cb = new THREE.Vector3();
    for (i = grp.start; i < grp.start + grp.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      cb.subVectors(c, b); ab.subVectors(a, b); cb.cross(ab);
      var n = cb.clone(), u = cb.clone().normalize();
      for (var k = 0; k < 3; k++) {
        var p = k === 0 ? a : k === 1 ? b : c;
        var key = Math.round(p.x * 1e4) + '_' + Math.round(p.y * 1e4) + '_' + Math.round(p.z * 1e4);
        (map[key] || (map[key] = [])).push({ i: i + k, n: n, u: u });
      }
    }
    var acc = new THREE.Vector3();
    Object.keys(map).forEach(function (key) {
      var list = map[key];
      for (var j = 0; j < list.length; j++) {
        acc.set(0, 0, 0);
        for (var m = 0; m < list.length; m++) if (list[j].u.dot(list[m].u) > cos) acc.add(list[m].n);
        if (acc.lengthSq() > 0) { acc.normalize(); nor.setXYZ(list[j].i, acc.x, acc.y, acc.z); }
      }
    });
    nor.needsUpdate = true;
  }

  /* Soft light field. The falloff is computed in the shader and dithered,
     so a faint gradient on a dark ground does not show bands. Colours are
     plain sRGB numbers, added straight to the frame. */
  var HALO_VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}';
  var HALO_FRAG = [
    'uniform vec3 uColor;',
    'uniform float uPower;',
    'varying vec2 vUv;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main() {',
    '  float r = length(vUv - 0.5) * 2.0;',
    '  float f = max(exp(-r * r * 3.4) - 0.0334, 0.0) / 0.9666;',
    '  vec3 c = uColor * (f * uPower);',
    '  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(max(c, 0.0), 1.0);',
    '}'
  ].join('\n');
  function hexVec(THREE, hex) { return new THREE.Vector3((hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255); }

  function softDot(THREE) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.19)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.045)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* back of the phone: the Forma mark */
  function backTexture(THREE, ratio) {
    var c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * ratio);
    var x = c.getContext('2d');
    function rr(px, py, w, h, r) {
      x.beginPath(); x.moveTo(px + r, py);
      x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
      x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
    }
    function spaced(text, cx, y, gap) {
      var w = 0, i; for (i = 0; i < text.length; i++) w += x.measureText(text[i]).width + (i < text.length - 1 ? gap : 0);
      var px = cx - w / 2; x.textAlign = 'left';
      for (i = 0; i < text.length; i++) { x.fillText(text[i], px, y); px += x.measureText(text[i]).width + gap; }
    }
    function draw() {
      var W = c.width, H = c.height;
      var g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#1B2420'); g.addColorStop(1, '#101613');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      var s = 92, cx = W / 2, cy = H * 0.5 - 36;
      x.fillStyle = '#E3A548'; rr(cx - s / 2, cy - s / 2, s, s, 26); x.fill();
      x.fillStyle = '#EDE6D6'; x.textAlign = 'center'; x.textBaseline = 'top';
      x.font = '600 64px Unbounded, Manrope, sans-serif';
      x.fillText('forma', cx, cy + s / 2 + 36);
      x.fillStyle = 'rgba(237,230,214,0.55)';
      x.font = '500 19px "JetBrains Mono", monospace';
      spaced('STUDIO', cx, cy + s / 2 + 122, 8);
    }
    draw();
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('600 64px Unbounded', 'forma'), document.fonts.load('500 19px "JetBrains Mono"', 'STUDIO')])
        .then(function () { draw(); t.needsUpdate = true; }).catch(function () {});
    }
    return t;
  }

  F.initHero = function (o) {
    return F.loadThree().then(function (THREE) { return build(THREE, o); });
  };

  function build(THREE, o) {
    var section = o.section, canvas = o.canvas, anchor = o.anchor, video = o.video, showcase = o.showcase, hint = o.hint;
    var reduced = !!F.reduced, coarse = !!F.coarse;
    var css = getComputedStyle(document.documentElement);
    var BG = new THREE.Color((css.getPropertyValue('--bg') || '').trim() || '#0E1311');
    var ACCENT = new THREE.Color((css.getPropertyValue('--accent') || '').trim() || '#E3A548');

    /* transparent canvas: the living page background stays visible behind the phone */
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);

    var FOV = 30, CAM_Z = 11, TAN = Math.tan(FOV * Math.PI / 360);
    var camera = new THREE.PerspectiveCamera(FOV, 1, 1, 60);
    camera.position.set(0, 0, CAM_Z);
    var scene = new THREE.Scene();

    /* studio lights as an environment map: a warm key, a cool fill, an amber rim */
    (function () {
      var pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
      es.background = new THREE.Color(0x060908);
      function box(hex, k, w, h, x, y, z) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
        m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
      }
      box(0xffecd2, 6.5, 7, 4, -7, 5.5, 6);
      box(0xc4e6d8, 2.0, 5, 9, 9, 1, 3);
      box(0xffc27a, 3.6, 11, 2.5, 0, -6.5, -5);
      box(0xffffff, 2.4, 4, 4, 1, 8, -2);
      scene.environment = pm.fromScene(es, 0.04).texture;
      pm.dispose();
    })();
    var key = new THREE.DirectionalLight(0xfff4e4, 1.5); key.position.set(-4, 5, 6); scene.add(key);
    var rimLight = new THREE.DirectionalLight(0xffc88a, 0.9); rimLight.position.set(5, -2, -6); scene.add(rimLight);

    /* ---------- the phone ---------- */

    var SW = 1.38, SH = SW * 1142 / 480;          /* screen, same ratio as the recording */
    var BEZ = 0.05, LW = SW + BEZ * 2, LH = SH + BEZ * 2;
    var BEV = 0.036, DEPTH = 0.105, R_LID = 0.235, R_SCR = R_LID - BEZ;
    var PHONE_W = LW + BEV * 2, PHONE_H = LH + BEV * 2, ZF = DEPTH / 2 + BEV;

    var rig = new THREE.Group(), phone = new THREE.Group();
    rig.add(phone); scene.add(rig);

    var bodyGeo = new THREE.ExtrudeGeometry(rrShape(THREE, LW, LH, R_LID), {
      depth: DEPTH, steps: 1, curveSegments: 10,
      bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 5
    });
    bodyGeo.translate(0, 0, -DEPTH / 2);
    smoothSides(THREE, bodyGeo, 42);
    var mGlass = new THREE.MeshStandardMaterial({ color: 0x040606, metalness: 0, roughness: 0.14 });
    var mFrame = new THREE.MeshStandardMaterial({ color: 0xb2ab9f, metalness: 1, roughness: 0.32, envMapIntensity: 1.2 });
    phone.add(new THREE.Mesh(bodyGeo, [mGlass, mFrame]));

    var scrGeo = new THREE.ShapeGeometry(rrShape(THREE, SW, SH, R_SCR), 10);
    remapUV(scrGeo, SW, SH);
    var screen = new THREE.Mesh(scrGeo, mGlass);
    screen.position.z = ZF + 0.0015;
    phone.add(screen);

    /* glass over the whole front: black base, additive, so only reflections show */
    var mGlare = new THREE.MeshPhysicalMaterial({
      color: 0x000000, metalness: 0, roughness: 0.2, ior: 1.8,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 0.9
    });
    var glare = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(THREE, LW, LH, R_LID), 10), mGlare);
    glare.position.z = ZF + 0.003; glare.renderOrder = 5;
    phone.add(glare);

    var backGeo = new THREE.ShapeGeometry(rrShape(THREE, LW, LH, R_LID), 10);
    remapUV(backGeo, LW, LH);
    var back = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({ map: backTexture(THREE, LH / LW), metalness: 0.2, roughness: 0.55 }));
    back.rotation.y = Math.PI; back.position.z = -(ZF + 0.0015);
    phone.add(back);

    (function () {  /* camera island on the back */
      var isl = new THREE.Mesh(
        new THREE.ExtrudeGeometry(rrShape(THREE, 0.6, 0.6, 0.17), { depth: 0.018, steps: 1, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 }),
        new THREE.MeshStandardMaterial({ color: 0x0c100f, metalness: 0.3, roughness: 0.35 })
      );
      isl.position.set(-LW / 2 + 0.44, LH / 2 - 0.44, 0.009);
      back.add(isl);
      var lensGeo = new THREE.CylinderGeometry(0.112, 0.112, 0.02, 40); lensGeo.rotateX(Math.PI / 2);
      var ringGeo = new THREE.TorusGeometry(0.12, 0.014, 10, 40);
      var mLens = new THREE.MeshStandardMaterial({ color: 0x06090a, metalness: 0.9, roughness: 0.12 });
      [[-0.13, 0.13], [0.13, -0.13]].forEach(function (p) {
        var lens = new THREE.Mesh(lensGeo, mLens); lens.position.set(p[0], p[1], 0.036); isl.add(lens);
        var ring = new THREE.Mesh(ringGeo, mFrame); ring.position.set(p[0], p[1], 0.04); isl.add(ring);
      });
    })();

    (function () {  /* side buttons */
      var bx = PHONE_W / 2 + 0.004;
      [[bx, 0.55, 0.36], [-bx, 0.86, 0.2], [-bx, 0.58, 0.2]].forEach(function (b) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(0.02, b[2], 0.045), mFrame);
        m.position.set(b[0], b[1], 0); phone.add(m);
      });
    })();

    /* ---------- light around it ---------- */

    var dot = softDot(THREE);
    var ACCENT_V = hexVec(THREE, ACCENT.getHex(THREE.SRGBColorSpace));
    function halo(colorVec, power) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        uniforms: { uColor: { value: colorVec }, uPower: { value: power } },
        vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
        transparent: true, depthWrite: false,
        /* light is added to the colour only; alpha stays untouched, so over the
           transparent canvas it simply brightens the page behind */
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
      }));
      scene.add(m); return m;
    }
    var glow = halo(ACCENT_V.clone(), 0);

    function makeDust(n, size, opacity, color) {
      var pos = new Float32Array(n * 3), seed = new Float32Array(n * 5);
      for (var i = 0; i < n; i++) {
        seed[i * 5] = Math.random() * 2 - 1;            /* x, share of the view */
        seed[i * 5 + 1] = Math.random() * 2.2 - 1.1;    /* y */
        seed[i * 5 + 2] = -5.5 + Math.random() * 5;     /* z, always behind the phone */
        seed[i * 5 + 3] = 0.012 + Math.random() * 0.03; /* rise speed */
        seed[i * 5 + 4] = Math.random() * TAU;          /* phase */
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var p = new THREE.Points(g, new THREE.PointsMaterial({
        map: dot, color: color, size: size / TAN, sizeAttenuation: true,
        transparent: true, opacity: opacity, depthWrite: false, toneMapped: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
      }));
      p.frustumCulled = false; p.userData.seed = seed;
      scene.add(p); return p;
    }
    var dustA = makeDust(coarse ? 34 : 60, 0.075, 0.85, 0xffe6bd);
    var dustB = makeDust(coarse ? 7 : 12, 0.8, 0.09, 0xffb866);

    /* ---------- what the screen shows ---------- */

    var loader = new THREE.TextureLoader();
    var maxAniso = renderer.capabilities.getMaxAnisotropy();
    var poster = loader.load(o.poster); poster.colorSpace = THREE.SRGBColorSpace;
    var mVideo = new THREE.MeshBasicMaterial({ map: poster, toneMapped: false });
    var videoTex = null;
    function attachVideo() {
      if (videoTex || video.readyState < 2) return;
      videoTex = new THREE.VideoTexture(video); videoTex.colorSpace = THREE.SRGBColorSpace;
      mVideo.map = videoTex; mVideo.needsUpdate = true;
    }
    screen.material = mVideo;

    var STEP = 0.72, HOLD = 1.05, MOVE = 0.95, VIDEO_SLOT = 12;
    var sites = o.sites.map(function (s) {
      return { kind: s.kind, src: s.src, mat: s.kind === 'video' ? mVideo : null, tex: null, frac: 1, max: 0, slot: VIDEO_SLOT, t: 0, loading: false, failed: false };
    });
    function loadScroll(site, done) {
      if (site.mat || site.loading || site.failed) { if (done) done(); return; }
      site.loading = true;
      loader.load(site.src, function (tex) {
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(4, maxAniso);
        var img = tex.image;
        site.frac = clamp((img.width * (SH / SW)) / img.height, 0.05, 1);
        site.max = 1 / site.frac - 1;
        site.slot = Math.ceil(site.max / STEP) * (HOLD + MOVE) + 1.3;
        tex.repeat.set(1, site.frac); tex.offset.set(0, 1 - site.frac);
        site.tex = tex; site.mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
        try { renderer.initTexture(tex); } catch (e) {}
        site.loading = false; if (done) done();
      }, undefined, function () { site.loading = false; site.failed = true; if (done) done(); });
    }
    /* scrolls like a thumb: a flick, a pause, a flick */
    function scrollAt(site) {
      var cyc = HOLD + MOVE, k = Math.floor(site.t / cyc), ph = site.t - k * cyc;
      var from = Math.min(site.max, k * STEP), to = Math.min(site.max, (k + 1) * STEP);
      return ph < HOLD ? from : from + (to - from) * easeInOut((ph - HOLD) / MOVE);
    }

    var cur = 0, want = 0, slotT = 0, spin = null, spinAng = 0, needGesture = false, running = false;

    function playVideo() {
      if (reduced) return;
      var p = video.play();
      if (p && p.catch) p.catch(function () { needGesture = true; });
    }
    function rewind() { try { video.currentTime = 0; } catch (e) {} }
    function swap(i) {
      if (sites[cur].kind === 'video') video.pause();
      cur = i; slotT = 0;
      var s = sites[i];
      screen.material = s.mat;
      if (s.kind === 'video') {
        if (video.ended || (video.duration && video.currentTime > video.duration - 0.4)) rewind();
        if (running) playVideo();
      } else { s.t = 0; s.tex.offset.y = 1 - s.frac; }
      sampleT = 9;
    }
    function select(i) {
      i = (i % sites.length + sites.length) % sites.length;
      if (sites[i].failed) return;
      want = i;
      if (showcase) showcase.set(i);
      if (!sites[i].mat) loadScroll(sites[i]);
    }
    function restartSlot() {
      slotT = 0;
      var c = sites[cur];
      if (c.kind === 'video') { if (video.ended) { rewind(); playVideo(); } } else c.t = 0;
    }
    function advance() {
      var n = cur, guard = 0;
      do { n = (n + 1) % sites.length; guard++; } while (sites[n].failed && guard < sites.length);
      if (n === cur) { restartSlot(); return; }
      if (!sites[n].mat) { loadScroll(sites[n]); restartSlot(); return; }
      select(n);
    }

    video.muted = true; video.loop = false;
    video.removeAttribute('loop'); video.removeAttribute('autoplay');
    video.addEventListener('loadeddata', attachVideo);
    video.addEventListener('playing', attachVideo);
    video.addEventListener('ended', function () { if (sites[cur].kind === 'video' && want === cur && !spin) advance(); });
    attachVideo();
    window.addEventListener('pointerdown', function () {
      if (needGesture && running && sites[cur].kind === 'video') { needGesture = false; playVideo(); }
    }, { passive: true });
    if (showcase) showcase.onSelect(select);

    /* ---------- the glow takes its colour from the screen ---------- */

    var sCan = document.createElement('canvas'); sCan.width = sCan.height = 4;
    var sCtx = null; try { sCtx = sCan.getContext('2d', { willReadFrequently: true }); } catch (e) {}
    var glowTarget = ACCENT_V.clone(), glowLum = 0.4, glowPower = 0, sampleT = 0, sampleDead = !sCtx, tmpV = new THREE.Vector3();
    function sample() {
      if (sampleDead) return;
      try {
        var s = sites[cur];
        if (s.kind === 'video') { if (video.readyState < 2) return; sCtx.drawImage(video, 0, 0, 4, 4); }
        else { var img = s.tex.image, vis = img.height * s.frac; sCtx.drawImage(img, 0, scrollAt(s) * vis, img.width, vis, 0, 0, 4, 4); }
        var d = sCtx.getImageData(0, 0, 4, 4).data, r = 0, g = 0, b = 0, n = d.length / 4;
        for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        r /= n * 255; g /= n * 255; b /= n * 255;
        glowLum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        glowTarget.copy(ACCENT_V).lerp(tmpV.set(r, g, b), 0.62);
      } catch (e) { sampleDead = true; }
    }

    /* ---------- pointer: tilt, drag with inertia ---------- */

    var ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    if (F.fine && !reduced) {
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        var r = anchor.getBoundingClientRect();
        ptr.tx = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.5), -1, 1);
        ptr.ty = clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight * 0.5), -1, 1);
      }, { passive: true });
      document.addEventListener('pointerleave', function () { ptr.tx = 0; ptr.ty = 0; });
    }

    var drag = { on: false, id: null, lx: 0, ly: 0, lt: 0, ang: 0, vel: 0, tilt: 0, since: 99 };
    var hintTimer = 0;
    function hideHint() { if (hint) hint.classList.remove('is-on'); clearTimeout(hintTimer); }
    anchor.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      drag.on = true; drag.id = e.pointerId; drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = e.timeStamp; drag.vel = 0;
      try { anchor.setPointerCapture(e.pointerId); } catch (err) {}
      anchor.classList.add('is-dragging'); hideHint();
    });
    anchor.addEventListener('pointermove', function (e) {
      if (!drag.on || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.lx, dy = e.clientY - drag.ly, dtm = Math.max(1, e.timeStamp - drag.lt) / 1000;
      drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = e.timeStamp;
      var da = dx * 0.011;
      drag.ang += da;
      drag.vel = 0.6 * drag.vel + 0.4 * clamp(da / dtm, -14, 14);
      drag.tilt = clamp(drag.tilt + dy * 0.004, -0.45, 0.45);
    });
    function endDrag(e) {
      if (!drag.on || (e && e.pointerId !== drag.id)) return;
      drag.on = false; drag.since = 0;
      anchor.classList.remove('is-dragging');
      if (reduced) drag.vel = 0;
    }
    anchor.addEventListener('pointerup', endDrag);
    anchor.addEventListener('pointercancel', endDrag);
    anchor.addEventListener('lostpointercapture', endDrag);

    /* ---------- layout: the phone sits where its DOM anchor is ---------- */

    var hh = TAN * CAM_Z, hw = hh, unitsPerPx = 0.01, scale = 1, ext = { cx: 0, cy: 0 };
    var startLine = 0, spT = 0, sp = 0;
    var narrow = false;

    function layout() {
      var cw = section.clientWidth, ch = section.clientHeight;
      if (!cw || !ch) return;
      var budget = coarse ? 2.6e6 : 5.2e6;
      var pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2, Math.sqrt(budget / (cw * ch)));
      renderer.setPixelRatio(Math.max(0.75, pr));
      renderer.setSize(cw, ch, false);
      var sr = section.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
      var ax = ar.left - sr.left + ar.width / 2, ay = ar.top - sr.top + ar.height / 2;
      camera.aspect = cw / ch;
      camera.setViewOffset(cw, ch, Math.round(cw / 2 - ax), Math.round(ch / 2 - ay), cw, ch);
      hw = hh * camera.aspect; unitsPerPx = (2 * hh) / ch;
      var phonePx = Math.min(ar.height * 0.93, (ar.width * 0.9) / (PHONE_W / PHONE_H));
      scale = (phonePx * unitsPerPx) / PHONE_H;
      rig.scale.setScalar(scale);
      ext.cx = (cw / 2 - ax) * unitsPerPx; ext.cy = (ay - ch / 2) * unitsPerPx;
      narrow = cw < 861;
      var docC = ar.top + (window.scrollY || 0) + ar.height / 2;
      startLine = Math.min(window.innerHeight * 0.5, docC);
      onScroll();
    }
    function onScroll() {
      var r = anchor.getBoundingClientRect(), c = r.top + r.height / 2;
      spT = clamp((startLine - c) / (window.innerHeight * 0.8), 0, 1);
      tryEnter();
    }
    F.onScroll(onScroll);
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () { layout(); });
      ro.observe(section); ro.observe(anchor);
    } else window.addEventListener('resize', layout);

    /* ---------- entrance ---------- */

    var armed = false, entered = false, enterT = 0, hintShown = false;
    function tryEnter() {
      if (!armed || entered) return;
      var r = anchor.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9 && r.bottom > 0) {
        entered = true;
        if (reduced) enterT = 1;
        setTimeout(function () { loadScroll(sites[1] || sites[0], function () { if (sites[2]) loadScroll(sites[2]); }); }, 1400);
      }
    }
    function enter() { armed = true; tryEnter(); }

    /* ---------- frame ---------- */

    var REST_X = 0.045, REST_Z = 0.03;

    function updDust(p, t, dt) {
      var seed = p.userData.seed, arr = p.geometry.attributes.position.array, n = seed.length / 5;
      for (var i = 0; i < n; i++) {
        var j = i * 5;
        if (!reduced) { seed[j + 1] += seed[j + 3] * dt; if (seed[j + 1] > 1.1) seed[j + 1] = -1.1; }
        var z = seed[j + 2], k = ((CAM_Z - z) / CAM_Z) * 1.05;
        arr[i * 3] = (ext.cx + (seed[j] + Math.sin(t * 0.25 + seed[j + 4]) * 0.03) * hw) * k;
        arr[i * 3 + 1] = (ext.cy + seed[j + 1] * hh) * k;
        arr[i * 3 + 2] = z;
      }
      p.geometry.attributes.position.needsUpdate = true;
    }

    function update(dt, t) {
      /* pointer tilt */
      ptr.x = damp(ptr.x, ptr.tx, 5, dt); ptr.y = damp(ptr.y, ptr.ty, 5, dt);

      /* drag: inertia first, then a spring brings the phone home the short way */
      if (!drag.on) {
        drag.since += dt;
        drag.ang += drag.vel * dt;
        drag.vel *= Math.exp(-dt * 2.2);
        var k = smooth(0.3, 1.2, drag.since), w = wrapPi(drag.ang);
        drag.vel += (-w * 15 * k - drag.vel * 5.5 * k) * dt;
        if (k >= 1 && Math.abs(w) < 0.0015 && Math.abs(drag.vel) < 0.002) { drag.ang = 0; drag.vel = 0; }
        drag.tilt = damp(drag.tilt, 0, 4, dt);
      }

      /* entrance */
      if (entered && enterT < 1) enterT = Math.min(1, enterT + dt / 1.6);
      var e = easeOut(enterT);
      if (enterT >= 1 && !hintShown && hint && !reduced) {
        hintShown = true;
        if (drag.since > 50) { hint.classList.add('is-on'); hintTimer = setTimeout(hideHint, 6500); }
      }

      /* playlist */
      if (!spin && want !== cur && sites[want].mat) {
        if (reduced) swap(want); else spin = { t: 0, to: want, done: false };
      }
      if (spin) {
        spin.t += dt / 1.05;
        spinAng = easeInOut(Math.min(1, spin.t)) * TAU;
        if (!spin.done && spin.t >= 0.5) { swap(spin.to); spin.done = true; }
        if (spin.t >= 1) { spin = null; spinAng = 0; }
      } else if (entered && enterT >= 1 && !reduced && want === cur) {
        var c = sites[cur];
        slotT += dt;
        if (c.kind === 'scroll') { c.t += dt; c.tex.offset.y = 1 - c.frac - scrollAt(c) * c.frac; }
        if (showcase) showcase.progress(slotT / c.slot);
        if (slotT >= c.slot && !drag.on) advance();
      }

      /* scroll: the phone turns away and leaves */
      sp = damp(sp, reduced ? 0 : spT, 9, dt);
      var se = sp * sp * (3 - 2 * sp);

      var restY = narrow ? -0.24 : -0.36;
      var idleY = reduced ? 0 : Math.sin(t * 0.55) * 0.07, idleX = reduced ? 0 : Math.sin(t * 0.4 + 1) * 0.022;
      var bob = reduced ? 0 : Math.sin(t * 0.8) * 0.05;
      phone.rotation.set(
        REST_X + idleX + ptr.y * 0.14 + drag.tilt,
        restY + idleY + ptr.x * 0.2 + drag.ang + spinAng - (1 - e) * 1.7,
        REST_Z - ptr.x * 0.02
      );
      rig.position.set(se * 0.75 * scale, (bob + se * 0.5) * scale - (1 - e) * hh * 2.1, -se * 4.6 * scale);
      rig.rotation.set(-se * 0.5, se * 1.25, 0);

      /* glow */
      sampleT += dt;
      if (sampleT > 0.3) { sampleT = 0; sample(); }
      glow.material.uniforms.uColor.value.lerp(glowTarget, 1 - Math.exp(-dt * 3));
      glowPower = damp(glowPower, e * (0.1 + 0.2 * glowLum) * (narrow ? 0.62 : 1) * (1 - se), 4, dt);
      glow.material.uniforms.uPower.value = glowPower;
      glow.position.set(rig.position.x, rig.position.y, rig.position.z - 1.3 * scale);
      glow.scale.setScalar((narrow ? 7 : 9) * scale);

      updDust(dustA, t, dt); updDust(dustB, t, dt);
    }

    var raf = 0, last = 0, inView = true, tabOn = !document.hidden, lost = false;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = clamp((now - last) / 1000, 0.001, 0.05); last = now;
      update(dt, now / 1000);
      renderer.render(scene, camera);
    }
    function sync() {
      var on = inView && tabOn && !lost;
      if (on && !running) {
        running = true; last = performance.now(); raf = requestAnimationFrame(frame);
        if (sites[cur].kind === 'video' && !spin) playVideo();
      } else if (!on && running) {
        running = false; cancelAnimationFrame(raf); video.pause();
      }
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { inView = es[0].isIntersecting; sync(); }, { rootMargin: '120px 0px' }).observe(section);
    }
    document.addEventListener('visibilitychange', function () { tabOn = !document.hidden; sync(); });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault(); lost = true; sync();
      section.classList.remove('has-3d');
      if (F.fallbackShowcase) F.fallbackShowcase();
    });

    layout();
    update(0.016, 0);
    /* The phone waits below the view until the entrance, so compile its
       shaders now; otherwise the first frame of the entrance would stutter. */
    try { renderer.compile(scene, camera); } catch (e) {}
    renderer.render(scene, camera);
    section.classList.add('has-3d');
    sync();

    return { enter: enter, select: select };
  }
})();

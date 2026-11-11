/* Forma Studio: the living background. Large soft forms (rounded squares that
   turn into circles, like the studio mark) drift slowly in the dark. Drawn by
   one small WebGL shader (no libraries, no video file to download).
   Colours are the studio palette only: green-black ground, deep lake green,
   a little warm amber. It runs at low resolution and 30 fps, so it stays cheap. */
(function () {
  'use strict';

  var F = window.FORMA = window.FORMA || {};

  var VERT = 'attribute vec2 p;\nvoid main() { gl_Position = vec4(p, 0.0, 1.0); }';

  var FRAG = [
    'precision PRECISION float;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uScroll;',   /* page scroll in screens */
    'uniform float uWarm;',     /* 0 at the top of the page, 1 at the very end */
    'uniform vec3 uMouse;',     /* xy in 0..1, z = strength */
    'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }',
    'float sdRound(vec2 p, float s, float r) { vec2 q = abs(p) - s + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    /* one soft form: a rounded square that slowly becomes a circle and back (the studio mark).
       Returns colour in rgb and coverage in a. */
    'vec4 form(vec2 p, vec2 c, float s, float morph, float ang, float soft, vec3 hi, vec3 lo) {',
    '  vec2 l = rot(ang) * (p - c);',
    '  float d = sdRound(l, s, mix(0.3 * s, s, morph));',
    '  float m = smoothstep(soft, -soft * 0.4, d);',
    '  float g = clamp(0.5 + (l.y - l.x) * 0.42 / s, 0.0, 1.0);',        /* lit from the upper left */
    '  vec3 col = mix(lo, hi, g * g);',
    '  col += hi * exp(-abs(d) / (soft * 0.3 + 0.012)) * 0.22;',          /* thin light on the edge */
    '  return vec4(col, m);',
    '}',
    'float wrapY(float y) { return mod(y + 1.15, 2.3) - 1.15; }',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  float asp = uRes.x / uRes.y;',
    '  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
    '  float t = uTime;',
    '  float hw = asp * 0.5;',
    '  vec3 base = vec3(0.055, 0.075, 0.067);',       /* #0E1311 */
    '  vec3 emerald = vec3(0.075, 0.345, 0.250);',
    '  vec3 emeraldLo = vec3(0.020, 0.105, 0.085);',
    '  vec3 teal = vec3(0.070, 0.250, 0.250);',
    '  vec3 tealLo = vec3(0.025, 0.085, 0.090);',
    '  vec3 amber = vec3(0.890, 0.647, 0.282);',      /* #E3A548 */
    '  vec3 amberLo = vec3(0.300, 0.165, 0.050);',
    '  vec3 col = base;',
    '  vec4 f;',
    /* far, very soft forms */
    '  f = form(p, vec2(-0.62 * hw + 0.06 * sin(t * 0.11), wrapY(-0.34 + 0.05 * cos(t * 0.09) + uScroll * 0.16)), 0.34, 0.5 + 0.5 * sin(t * 0.07), t * 0.021, 0.34, teal, tealLo);',
    '  col = mix(col, f.rgb, f.a * 0.85);',
    '  f = form(p, vec2(0.52 * hw + 0.05 * cos(t * 0.10), wrapY(0.12 + 0.06 * sin(t * 0.08) + uScroll * 0.22)), 0.36, 0.5 + 0.5 * sin(t * 0.06 + 2.0), -t * 0.017 + 0.6, 0.28, emerald, emeraldLo);',
    '  col = mix(col, f.rgb, f.a * 0.9);',
    /* warm lantern form: stronger toward the end of the page */
    '  f = form(p, vec2(0.30 * hw + 0.07 * sin(t * 0.13 + 1.0), wrapY(-0.20 + 0.05 * sin(t * 0.12) + uScroll * 0.34)), 0.19, 0.5 + 0.5 * sin(t * 0.09 + 4.0), t * 0.03 + 1.1, 0.20, amber * 0.62, amberLo);',
    '  col = mix(col, f.rgb, f.a * (0.50 + 0.30 * uWarm));',
    /* nearer, sharper forms: they move faster, which gives depth */
    '  f = form(p, vec2(-0.26 * hw + 0.04 * cos(t * 0.16), wrapY(0.36 + 0.04 * sin(t * 0.15) + uScroll * 0.50)), 0.115, 0.5 + 0.5 * sin(t * 0.12 + 1.0), -t * 0.045, 0.07, emerald * 1.15, emeraldLo * 1.3);',
    '  col = mix(col, f.rgb, f.a * 0.8);',
    '  f = form(p, vec2(0.86 * hw + 0.03 * sin(t * 0.19), wrapY(-0.52 + 0.04 * cos(t * 0.17) + uScroll * 0.66)), 0.075, 0.5 + 0.5 * sin(t * 0.14 + 3.0), t * 0.06, 0.045, amber * 0.8, amberLo * 1.4);',
    '  col = mix(col, f.rgb, f.a * 0.75);',
    /* light under the cursor */
    '  vec2 md = (uv - uMouse.xy) * vec2(asp, 1.0);',
    '  col += amber * exp(-dot(md, md) * 7.0) * 0.05 * uMouse.z;',
    /* quieter behind the long reading sections, full again at the very end */
    '  float calm = mix(1.0, 0.55, smoothstep(0.35, 1.1, uScroll)) + 0.45 * smoothstep(0.86, 1.0, uWarm);',
    '  col = mix(base, col, min(calm, 1.0));',
    '  float vig = smoothstep(1.5, 0.35, length((uv - 0.5) * vec2(1.05, 1.0)) * 1.5);',
    '  col *= 0.62 + 0.38 * vig;',
    '  col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0 * 1.6;',   /* dither: no banding */
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function init() {
    var wrap = document.getElementById('bg'), canvas = document.getElementById('bgCanvas');
    if (!wrap || !canvas) return;
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    } catch (e) {}
    if (!gl) return;

    var hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    var frag = FRAG.replace('PRECISION', hp && hp.precision > 0 ? 'highp' : 'mediump');
    function shader(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    }
    var prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch (e) {
      if (window.console && console.warn) console.warn('[forma] background is static:', e);
      return;
    }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uRes = gl.getUniformLocation(prog, 'uRes'), uTime = gl.getUniformLocation(prog, 'uTime');
    var uScroll = gl.getUniformLocation(prog, 'uScroll'), uWarm = gl.getUniformLocation(prog, 'uWarm'), uMouse = gl.getUniformLocation(prog, 'uMouse');

    var reduced = !!F.reduced, coarse = !!F.coarse;
    var scale = coarse ? 0.4 : 0.5, lastW = 0, lastH = 0;
    function resize() {
      var w = wrap.clientWidth, h = wrap.clientHeight;
      /* phones change the viewport height while the address bar hides: ignore small changes */
      if (w === lastW && Math.abs(h - lastH) < 120) return false;
      lastW = w; lastH = h;
      canvas.width = Math.max(2, Math.round(w * scale));
      canvas.height = Math.max(2, Math.round(h * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      return true;
    }

    var mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, k: 0, tk: 0 };
    if (F.fine && !reduced) {
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        mouse.tx = e.clientX / window.innerWidth; mouse.ty = 1 - e.clientY / window.innerHeight; mouse.tk = 1;
      }, { passive: true });
      document.documentElement.addEventListener('pointerleave', function () { mouse.tk = 0; });
    }

    var t0 = performance.now(), scrollS = 0, warmS = 0;
    function draw(now) {
      var doc = document.documentElement;
      var y = window.scrollY || doc.scrollTop || 0, vh = window.innerHeight || 1;
      var max = Math.max(1, doc.scrollHeight - vh);
      scrollS += (y / vh - scrollS) * 0.12;
      warmS += (Math.min(1, y / max) - warmS) * 0.06;
      mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06; mouse.k += (mouse.tk - mouse.k) * 0.05;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduced ? 12.0 : (now - t0) / 1000 + 12.0);
      gl.uniform1f(uScroll, reduced ? y / vh : scrollS);
      gl.uniform1f(uWarm, reduced ? Math.min(1, y / max) : warmS);
      gl.uniform3f(uMouse, mouse.x, mouse.y, mouse.k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    var raf = 0, last = 0, running = false;
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (now - last < 31) return;        /* about 30 frames a second is plenty for slow light */
      last = now; draw(now);
    }
    function sync() {
      var on = !document.hidden && !reduced;
      if (on && !running) { running = true; raf = requestAnimationFrame(loop); }
      else if (!on && running) { running = false; cancelAnimationFrame(raf); }
    }
    window.addEventListener('resize', function () { if (resize() && !running) draw(performance.now()); });
    document.addEventListener('visibilitychange', sync);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); running = false; cancelAnimationFrame(raf); wrap.classList.remove('is-live'); });
    if (reduced) window.addEventListener('scroll', function () { requestAnimationFrame(draw); }, { passive: true });

    resize();
    draw(performance.now());
    wrap.classList.add('is-live');
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// The stage, as CleanMyMac 5 draws a module:
//  - the window is a living aurora in the module's colours — it flows on its own, leans toward the
//    pointer, and cross-fades when you change module;
//  - the module's render plays its intro when you arrive, then stays alive: it floats, and tilts in
//    3D toward the pointer on springs; while the module works (a focus session) it plays its scan loop.
// Renders come from the personal skin (js/skin.js): HEVC-with-alpha video in Safari, an AVIF frame
// atlas drawn on a canvas everywhere else.

import { skin } from './skin.js';
import { motionReduced, springValue } from './motion/animate.js';
import { springs } from './motion/spring.js';

/** Term page → the CleanMyMac module whose look it wears. */
export const MODULES = {
  home: 'spacelens',
  timetable: 'applications',
  planner: 'junk',
  school: 'clutter',
  focus: 'performance',
  settings: 'cloud',
};

// sky: [left, right, glow top-left, glow centre, glow bottom]. Smart Care, Space Lens and
// Performance are measured from the app's windows; the rest follow their aurora textures.
export const LOOKS = {
  smartcare: { sky: ['#8438ad', '#070a57', '#9a50c2', '#b4469e', '#6933a8'], button: ['#c446d9', '#7e2ca2'] },
  spacelens: { sky: ['#5a2aa8', '#120d3e', '#6a3ac0', '#5a48e0', '#43208a'], button: ['#7446f6', '#3a14b8'] },
  performance: { sky: ['#7c2f0c', '#b4521f', '#c3713c', '#dc8840', '#b9672b'], button: ['#eb9645', '#b5561c'] },
  applications: { sky: ['#1f3fb8', '#070f3e', '#2c5fd8', '#3c86f4', '#1a3296'], button: ['#4f86ff', '#1f40d0'] },
  junk: { sky: ['#2b7a2f', '#07230f', '#3f9a36', '#6fc43e', '#236a28'], button: ['#6cc44a', '#2c8a2b'] },
  clutter: { sky: ['#1c6f74', '#06222e', '#2a9294', '#45b8c4', '#195e66'], button: ['#45b7c0', '#1a6f7a'] },
  cloud: { sky: ['#2a5cc8', '#081644', '#3a7ae0', '#5aa4f2', '#2048a8'], button: ['#5a9cff', '#2456c8'] },
  protection: { sky: ['#9a2a7a', '#2a0a3a', '#b8388e', '#d24aa0', '#7a2070'], button: ['#e45aaa', '#9a2a7a'] },
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

// ---------- pointer ----------

// CleanMyMac turns each module's object to follow the pointer: across the window, left to right,
// the object steps through its 61-frame turn. Touch turns it while the finger moves, then it
// settles back to face you.
const pointer = { x: 0.5, seen: false, touch: false };
function onPointer(e) {
  if (e.pointerType === 'touch' && e.type === 'pointermove' && !pointer.touch) return;
  pointer.x = Math.max(0, Math.min(1, e.clientX / innerWidth));
  pointer.seen = true;
  if (e.pointerType === 'touch') pointer.touch = e.type !== 'pointerup' && e.type !== 'pointercancel';
  for (const r of renders) r.aim();
  kick();
}
window.addEventListener('pointermove', onPointer, { passive: true });
window.addEventListener('pointerdown', onPointer, { passive: true });
window.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') { pointer.touch = false; pointer.x = 0.5; for (const r of renders) r.aim(); kick(); } }, { passive: true });

// ---------- sky ----------

const FS = `
precision highp float;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uG1; uniform vec3 uG2; uniform vec3 uG3;
uniform float uT; uniform vec2 uView;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 11.3; a *= 0.5; } return v; }
// one colour point of the mesh: weight falls off with distance
float w(vec2 p, vec2 c, float r) { vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  float asp = clamp(uView.x / uView.y, 0.5, 1.9);
  float t = uT;
  // organic edges: the field is sampled through a slowly drifting warp
  vec2 q = p + 0.12 * (vec2(fbm(p * 2.2 + t * 0.06), fbm(p * 2.2 - t * 0.05 + 7.1)) - 0.5);
  q.x *= asp;
  // five colour points sweeping across the window — light, deep, mid, glow, low — as CleanMyMac's do
  vec2 c1 = vec2((0.22 + 0.34 * sin(t * 0.21)) * asp, 0.22 + 0.24 * cos(t * 0.17));
  vec2 c2 = vec2((0.82 + 0.3 * sin(t * 0.15 + 2.1)) * asp, 0.3 + 0.32 * sin(t * 0.19 + 0.7));
  vec2 c3 = vec2((0.45 + 0.4 * cos(t * 0.12 + 1.0)) * asp, 0.86 + 0.16 * sin(t * 0.23));
  vec2 c4 = vec2((0.6 + 0.22 * sin(t * 0.27 + 3.0)) * asp, 0.42 + 0.2 * cos(t * 0.21 + 1.4));
  vec2 c5 = vec2((0.08 + 0.26 * cos(t * 0.16 + 2.6)) * asp, 0.8 + 0.22 * sin(t * 0.14 + 0.3));
  float w1 = w(q, c1, 0.52 * asp); float w2 = w(q, c2, 0.5 * asp); float w3 = w(q, c3, 0.5 * asp);
  float w4 = w(q, c4, 0.3 * asp); float w5 = w(q, c5, 0.42 * asp);
  vec3 c = (uG1 * w1 + uB * w2 + uA * w3 + uG2 * w4 * 0.9 + uG3 * w5 + uA * 0.12) / (w1 + w2 + w3 + w4 * 0.9 + w5 + 0.12);
  // CleanMyMac's windows darken toward the far edge
  c *= 1.0 - 0.18 * smoothstep(0.55, 1.15, length((p - vec2(0.45, 0.4)) * vec2(1.0, 0.8)));
  c += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;
const VS = 'attribute vec2 p; varying vec2 vUv; void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';

const palette = { from: null, to: null, t0: 0, dur: 900, cur: null };
let sky = null;
const t0 = performance.now();
let current = 'spacelens';

function paletteAt(now) {
  if (!palette.from) return palette.to;
  const k = Math.min(1, (now - palette.t0) / palette.dur);
  const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
  const out = palette.to.map((c, i) => c.map((v, j) => palette.from[i][j] + (v - palette.from[i][j]) * e));
  palette.cur = out;
  if (k >= 1) { palette.from = null; palette.cur = null; }
  return out;
}

export function initSky(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return false;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('[term] sky', gl.getProgramInfoLog(prog)); return false; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(['uA', 'uB', 'uG1', 'uG2', 'uG3', 'uT', 'uView'].map((k) => [k, gl.getUniformLocation(prog, k)]));
  sky = { gl, u, last: 0, dirty: true };
  const size = () => {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    const k = w * h > 1.4e6 ? 3 : 2;
    canvas.width = Math.max(64, Math.round(w / k));
    canvas.height = Math.max(64, Math.round(h / k));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.uView, w, h);
    sky.dirty = true;
    kick();
  };
  size();
  new ResizeObserver(size).observe(canvas);
  return true;
}

function drawSky(now) {
  if (!sky || !palette.to) return false;
  const reduced = motionReduced();
  const moving = !!palette.from;
  if (!(sky.dirty || moving || (!reduced && now - sky.last > 33))) return !reduced;
  const { gl, u } = sky;
  const c = paletteAt(now);
  gl.uniform3fv(u.uA, c[0]); gl.uniform3fv(u.uB, c[1]); gl.uniform3fv(u.uG1, c[2]); gl.uniform3fv(u.uG2, c[3]); gl.uniform3fv(u.uG3, c[4]);
  gl.uniform1f(u.uT, reduced ? 40 : (now - t0) / 1000);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  sky.last = now;
  sky.dirty = false;
  return !reduced || !!palette.from;
}

function paintVars() {
  const look = LOOKS[current];
  const r = document.documentElement.style;
  r.setProperty('--sky-a', look.sky[0]);
  r.setProperty('--sky-b', look.sky[1]);
  r.setProperty('--btn-top', look.button[0]);
  r.setProperty('--btn-bottom', look.button[1]);
  const tex = skin.url(`orb/${current}.png`);
  r.setProperty('--orb-tex', tex ? `url("${tex}")` : 'none');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', look.sky[0]);
}
skin.onChange(paintVars);

/** Cross-fade the window into a page's colour world. */
export function setModule(page, { instant = false } = {}) {
  current = MODULES[page] || 'spacelens';
  const target = LOOKS[current].sky.map(rgb);
  palette.from = !instant && palette.to && !motionReduced() ? (palette.cur || palette.to) : null;
  palette.to = target;
  palette.cur = null;
  palette.t0 = performance.now();
  paintVars();
  if (sky) sky.dirty = true;
  kick();
}

// ---------- frame atlases (browsers without HEVC-alpha video) ----------

const atlasCache = new Map(); // key/name → Promise<ImageBitmap>
function atlasBitmap(key, name) {
  const id = `${key}/${name}`;
  if (!atlasCache.has(id)) {
    const url = skin.url(`${id}.avif`);
    atlasCache.set(id, url ? fetch(url).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null) : Promise.resolve(null));
    // keep two modules decoded at most
    const keys = [...atlasCache.keys()];
    const modules = [...new Set(keys.map((k) => k.split('/')[0]))];
    if (modules.length > 2) for (const k of keys.filter((x) => x.startsWith(`${modules[0]}/`))) { atlasCache.get(k).then((bm) => bm?.close?.()); atlasCache.delete(k); }
  }
  return atlasCache.get(id);
}
skin.onChange(() => { for (const p of atlasCache.values()) p.then((bm) => bm?.close?.()); atlasCache.clear(); });

// ---------- renders ----------

const renders = new Set();
let raf = 0;

/** A page's render slot: the object turns to follow the pointer; while the module works it plays
 *  its scan loop. Frames come from the skin's AVIF atlases, drawn on a canvas. */
export function createRender(slot, page) {
  const key = MODULES[page] || 'spacelens';
  const art = document.createElement('div');
  art.className = 'mod-art';
  const canvas = document.createElement('canvas');
  canvas.className = 'mod-canvas';
  const ctx = canvas.getContext('2d');
  art.append(canvas);
  slot.append(art);
  slot.dataset.cmm = key;

  let mode = 'intro';
  let bm = null; // decoded atlas for the current mode
  let meta = null;
  let scanT0 = 0;
  let drawn = -1;
  let visible = false;
  let token = 0;
  const frame = springValue(30, null, 0.005);
  const self = { step, aim };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { renders.add(self); kick(); } else renders.delete(self); });
  io.observe(slot);

  const frames = () => meta?.frames || 61;
  /** The frame that faces the pointer (the middle frame faces you). */
  const target = () => (pointer.seen ? pointer.x : 0.5) * (frames() - 1);

  function aim() {
    if (mode !== 'intro' || !bm || motionReduced()) return;
    frame.to(target(), springs.gentle);
  }

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(slot.clientWidth * dpr);
    const h = Math.round(slot.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; drawn = -1; }
  }
  new ResizeObserver(() => { size(); kick(); }).observe(slot);

  function blit(i, alpha) {
    const sx = (i % meta.cols) * meta.w;
    const sy = Math.floor(i / meta.cols) * meta.h;
    const k = Math.min(canvas.width / meta.w, canvas.height / meta.h);
    const dw = meta.w * k;
    const dh = meta.h * k;
    ctx.globalAlpha = alpha;
    ctx.drawImage(bm, sx, sy, meta.w, meta.h, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }
  /** Draw a fractional frame: the two neighbours blended, so the turn is smooth between frames. */
  function draw(f) {
    if (!bm) return;
    const n = frames();
    f = Math.max(0, Math.min(n - 1, f));
    const i = Math.floor(f);
    const t = f - i;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    blit(i, 1);
    if (t > 0.02 && i + 1 < n) blit(i + 1, t);
    ctx.globalAlpha = 1;
    drawn = f;
  }

  async function load(name) {
    const my = ++token;
    const m = skin.meta?.atlas?.[key]?.[name];
    if (!m) return false;
    const b = await atlasBitmap(key, name);
    if (!b || my !== token) return false;
    bm = b;
    meta = m;
    mode = name;
    size();
    drawn = -1;
    return true;
  }

  function step(now) {
    if (!bm) return false;
    if (mode === 'scan') {
      const i = Math.floor(((now - scanT0) / 1000) * 30) % frames();
      if (i !== drawn) draw(i);
      return visible;
    }
    const f = frame.current();
    if (Math.abs(f - drawn) > 0.004) draw(f);
    return visible && frame.running;
  }

  return {
    /** Arriving on the page: the object turns in to face the pointer. */
    async intro() {
      slot.classList.toggle('is-empty', !skin.has);
      if (!skin.has) return;
      if (mode === 'scan' && bm) return;
      slot.classList.remove('is-in');
      if (!(await load('intro'))) return;
      const to = target();
      if (motionReduced()) { frame.set(to); draw(to); }
      else {
        frame.set(Math.max(0, Math.min(frames() - 1, to + (to > frames() / 2 ? -22 : 22))));
        frame.to(to, springs.smooth);
      }
      draw(frame.current());
      void slot.offsetWidth;
      slot.classList.add('is-in');
      kick();
    },
    /** While the module works, the scan loop plays. */
    async scan(on) {
      if (on === (mode === 'scan')) return;
      if (on) { if (await load('scan')) { scanT0 = performance.now(); draw(0); kick(); } }
      else { mode = 'intro'; await this.intro(); }
    },
    paint() { slot.classList.toggle('is-empty', !skin.has); },
  };
}

// ---------- one loop for everything ----------

function loop(now) {
  raf = 0;
  let again = drawSky(now);
  for (const r of renders) if (r.step(now)) again = true;
  if (again) raf = requestAnimationFrame(loop);
}
export function kick() { if (!raf) raf = requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (sky) sky.dirty = true; kick(); } });

/** Small images from the skin: sidebar icons (side-on/side-off), tile icons, extras. */
export const iconOf = (page, kind = 'side-off') => skin.url(`${MODULES[page] || page}/${kind}.png`);
export const extraOf = (name) => skin.url(`extra/${name}.png`);

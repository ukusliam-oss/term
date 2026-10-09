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

// ---------- pointer (shared by sky and renders) ----------

const pointer = { x: 0.5, y: 0.4, active: false };
const px = springValue(0.5, null);
const py = springValue(0.4, null);
function onPointer(e) {
  pointer.x = e.clientX / innerWidth;
  pointer.y = e.clientY / innerHeight;
  pointer.active = true;
  if (motionReduced()) return;
  px.to(pointer.x, springs.gentle);
  py.to(pointer.y, springs.gentle);
  kick();
}
window.addEventListener('pointermove', onPointer, { passive: true });
window.addEventListener('pointerdown', onPointer, { passive: true });
document.addEventListener('pointerleave', () => { pointer.active = false; px.to(0.5, springs.gentle); py.to(0.4, springs.gentle); kick(); });

// ---------- sky ----------

const FS = `
precision highp float;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uG1; uniform vec3 uG2; uniform vec3 uG3;
uniform float uT; uniform vec2 uView; uniform vec2 uMouse;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.02 + 13.7; a *= 0.5; } return v; }
float blob(vec2 p, vec2 c, float r) { vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  float asp = clamp(uView.x / uView.y, 0.45, 1.8);
  vec2 q = vec2(p.x * asp, p.y);
  float t = uT;
  // the flow: coordinates pushed around by slow noise, so colour moves like liquid
  vec2 w = vec2(fbm(q * 1.4 + vec2(t * 0.045, -t * 0.03)), fbm(q * 1.4 + vec2(-t * 0.035, t * 0.05) + 5.2));
  vec2 r = q + 0.55 * (w - 0.5);
  vec2 m = vec2(uMouse.x * asp, uMouse.y);
  // the light leans toward the pointer
  vec2 lean = (m - vec2(0.5 * asp, 0.45)) * 0.12;
  vec3 c = mix(uA, uB, smoothstep(0.0, 1.0, (r.x / asp) * 0.95 - r.y * 0.3 + 0.12));
  c = mix(c, uG1, 0.8 * blob(r, vec2((0.14 + 0.1 * sin(t * 0.17)) * asp, 0.06 + 0.08 * cos(t * 0.21)) + lean * 0.5, 0.5));
  c = mix(c, uG2, 0.62 * blob(r, vec2((0.6 + 0.1 * sin(t * 0.13 + 1.3)) * asp, 0.38 + 0.09 * cos(t * 0.15 + 0.4)) + lean, 0.36));
  c = mix(c, uG3, 0.74 * blob(r, vec2((0.3 + 0.16 * cos(t * 0.09)) * asp, 1.0 + 0.06 * sin(t * 0.19)) - lean * 0.6, 0.6));
  c += 0.07 * (uG2 + 0.25) * blob(q, m, 0.32);
  c += (hash(gl_FragCoord.xy + t) - 0.5) / 255.0;
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
  const u = Object.fromEntries(['uA', 'uB', 'uG1', 'uG2', 'uG3', 'uT', 'uView', 'uMouse'].map((k) => [k, gl.getUniformLocation(prog, k)]));
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
  const moving = !!palette.from || px.running || py.running;
  if (!(sky.dirty || moving || (!reduced && now - sky.last > 33))) return !reduced;
  const { gl, u } = sky;
  const c = paletteAt(now);
  gl.uniform3fv(u.uA, c[0]); gl.uniform3fv(u.uB, c[1]); gl.uniform3fv(u.uG1, c[2]); gl.uniform3fv(u.uG2, c[3]); gl.uniform3fv(u.uG3, c[4]);
  gl.uniform1f(u.uT, reduced ? 40 : (now - t0) / 1000);
  gl.uniform2f(u.uMouse, px.current(), py.current());
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

/** A page's render slot: intro on arrival, then alive (float + pointer tilt); scan loops. */
export function createRender(slot, page) {
  const key = MODULES[page] || 'spacelens';
  const art = document.createElement('div');
  art.className = 'mod-art';
  const still = document.createElement('img');
  still.className = 'mod-still';
  still.alt = '';
  still.decoding = 'async';
  const video = document.createElement('video');
  video.className = 'mod-video';
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.preload = 'auto';
  video.disablePictureInPicture = true;
  const canvas = document.createElement('canvas');
  canvas.className = 'mod-canvas';
  const ctx = canvas.getContext('2d');
  art.append(still, video, canvas);
  slot.append(art);
  slot.dataset.cmm = key;

  let scanning = false;
  let anim = null; // { bm, meta, t0, loop }
  let visible = false;
  const pop = springValue(1, null);
  const tiltX = springValue(0, null);
  const tiltY = springValue(0, null);
  const press = springValue(1, null);
  const self = { slot, step };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { renders.add(self); kick(); } else renders.delete(self); });
  io.observe(slot);

  const show = (which) => { slot.dataset.show = which; };
  function rest() {
    still.src = skin.url(`${key}/rest.png`);
    show(skin.has ? 'still' : 'none');
  }
  async function playVideo(name, loop) {
    const src = skin.url(`${key}/${name}.mov`);
    if (!src) return false;
    if (video.dataset.src !== src) { video.src = src; video.dataset.src = src; }
    video.loop = loop;
    try { video.currentTime = 0; await video.play(); show('video'); return true; } catch { return false; }
  }
  async function playAtlas(name, loop) {
    const meta = skin.meta?.atlas?.[key]?.[name];
    if (!meta) return false;
    const token = {};
    anim = { token, pending: true };
    const bm = await atlasBitmap(key, name);
    if (!bm || anim?.token !== token) return false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(slot.clientWidth * dpr);
    const h = Math.round(slot.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    anim = { token, bm, meta, loop, t0: performance.now(), last: -1 };
    show('canvas');
    kick();
    return true;
  }
  function drawFrame(i) {
    const { bm, meta } = anim;
    const sx = (i % meta.cols) * meta.w;
    const sy = Math.floor(i / meta.cols) * meta.h;
    const s = Math.min(canvas.width / meta.w, canvas.height / meta.h);
    const dw = meta.w * s;
    const dh = meta.h * s;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bm, sx, sy, meta.w, meta.h, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }
  async function play(name, loop) {
    if (!skin.has || motionReduced()) return false;
    if (skin.movies && await playVideo(name, loop)) return true;
    return playAtlas(name, loop);
  }

  function step(now) {
    // frames
    if (anim?.bm) {
      const n = anim.meta.frames;
      let i = Math.floor(((now - anim.t0) / 1000) * 30);
      if (anim.loop) i %= n; else i = Math.min(n - 1, i);
      if (i !== anim.last) { drawFrame(i); anim.last = i; }
    }
    // life: float, pointer tilt, press
    if (!motionReduced()) {
      const t = now / 1000;
      const r = slot.getBoundingClientRect();
      const cx = (r.left + r.width / 2) / innerWidth;
      const cy = (r.top + r.height / 2) / innerHeight;
      const nx = Math.max(-1, Math.min(1, (px.current() - cx) * 2.2));
      const ny = Math.max(-1, Math.min(1, (py.current() - cy) * 2.2));
      if (Math.abs(tiltY.target - nx) > 0.002) tiltY.to(nx, springs.gentle);
      if (Math.abs(tiltX.target - ny) > 0.002) tiltX.to(ny, springs.gentle);
      const fy = Math.sin(t * 0.9) * 5;
      const fr = Math.sin(t * 0.55) * 0.8;
      const s = pop.current() * press.current();
      art.style.transform = `translate3d(${tiltY.current() * 10}px, ${fy + tiltX.current() * 6}px, 0) perspective(900px) rotateX(${-tiltX.current() * 9}deg) rotateY(${tiltY.current() * 13}deg) rotateZ(${fr}deg) scale(${s})`;
    } else art.style.transform = '';
    return visible;
  }

  slot.addEventListener('pointerdown', () => { press.to(0.95, springs.quick); kick(); });
  const release = () => { press.to(1, springs.bouncy); kick(); };
  slot.addEventListener('pointerup', release);
  slot.addEventListener('pointerleave', release);

  return {
    async intro() {
      slot.classList.toggle('is-empty', !skin.has);
      if (scanning) { this.scan(true); return; }
      rest();
      anim = null;
      if (!motionReduced()) { pop.set(0.9); pop.to(1, springs.bouncy); }
      await play('intro', false);
      kick();
    },
    async scan(on) {
      if (on === scanning && slot.dataset.show) return;
      scanning = on;
      if (on) { if (!(await play('scan', true))) rest(); }
      else { video.pause(); anim = null; rest(); }
    },
    paint() { slot.classList.toggle('is-empty', !skin.has); if (!slot.dataset.show || slot.dataset.show === 'none' || slot.dataset.show === 'still') rest(); },
  };
}

// ---------- one loop for everything ----------

function loop(now) {
  raf = 0;
  let again = drawSky(now);
  for (const r of renders) if (r.step(now)) again = true;
  if (again && !document.hidden) raf = requestAnimationFrame(loop);
}
export function kick() { if (!raf) raf = requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (sky) sky.dirty = true; kick(); } });

/** Small images from the skin: sidebar icons (side-on/side-off), tile icons, extras. */
export const iconOf = (page, kind = 'side-off') => skin.url(`${MODULES[page] || page}/${kind}.png`);
export const extraOf = (name) => skin.url(`extra/${name}.png`);

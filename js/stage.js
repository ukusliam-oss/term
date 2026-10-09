// The stage, as CleanMyMac 5 draws a module: the whole window is a slow aurora in the module's
// colour, the module's render plays its intro when you arrive and then rests, and while the module
// works (here: a focus session) it plays its scan loop. Renders and icons come from the personal
// skin (js/skin.js); without one the colour world still works and the render slot stays empty.

import { skin } from './skin.js';
import { motionReduced } from './motion/animate.js';

/** Term page → the CleanMyMac module whose look it wears. */
export const MODULES = {
  home: 'smartcare',
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
  spacelens: { sky: ['#5428a2', '#140f40', '#5f34b4', '#4c3fd0', '#401c82'], button: ['#6a3cf4', '#3812b4'] },
  performance: { sky: ['#7c2f0c', '#b4521f', '#c3713c', '#dc8840', '#b9672b'], button: ['#eb9645', '#b5561c'] },
  applications: { sky: ['#1f3fb8', '#070f3e', '#2c5fd8', '#3c86f4', '#1a3296'], button: ['#4f86ff', '#1f40d0'] },
  junk: { sky: ['#2b7a2f', '#07230f', '#3f9a36', '#6fc43e', '#236a28'], button: ['#6cc44a', '#2c8a2b'] },
  clutter: { sky: ['#1c6f74', '#06222e', '#2a9294', '#45b8c4', '#195e66'], button: ['#45b7c0', '#1a6f7a'] },
  cloud: { sky: ['#2a5cc8', '#081644', '#3a7ae0', '#5aa4f2', '#2048a8'], button: ['#5a9cff', '#2456c8'] },
  protection: { sky: ['#9a2a7a', '#2a0a3a', '#b8388e', '#d24aa0', '#7a2070'], button: ['#e45aaa', '#9a2a7a'] },
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

// ---------- sky ----------

const FS = `
precision highp float;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uG1; uniform vec3 uG2; uniform vec3 uG3;
uniform float uT; uniform vec2 uView;
varying vec2 vUv;
float blob(vec2 p, vec2 c, float r, float asp) { vec2 d = (p - c) * vec2(asp, 1.0); return exp(-dot(d, d) / (r * r)); }
float hash(vec2 f) { return fract(sin(dot(f, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  float asp = min(uView.x / uView.y, 1.6);
  float t = uT;
  vec3 c = mix(uA, uB, smoothstep(0.0, 1.0, p.x * 0.95 - p.y * 0.3 + 0.12));
  c = mix(c, uG1, 0.78 * blob(p, vec2(0.12 + 0.07 * sin(t * 0.11), 0.06 + 0.06 * cos(t * 0.13)), 0.45, asp));
  c = mix(c, uG2, 0.55 * blob(p, vec2(0.6 + 0.08 * sin(t * 0.07 + 1.3), 0.36 + 0.07 * cos(t * 0.09 + 0.4)), 0.3, asp));
  c = mix(c, uG3, 0.72 * blob(p, vec2(0.3 + 0.12 * cos(t * 0.05), 1.0 + 0.05 * sin(t * 0.1)), 0.52, asp));
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;
const VS = 'attribute vec2 p; varying vec2 vUv; void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';

const palette = { from: null, to: null, t0: 0, dur: 900, cur: null };
let sky = null;
let raf = 0;
const t0 = performance.now();
let current = 'smartcare';

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
    canvas.width = Math.max(64, Math.round(w / 2));
    canvas.height = Math.max(64, Math.round(h / 2));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.uView, w, h);
    sky.dirty = true;
    kick();
  };
  size();
  new ResizeObserver(size).observe(canvas);
  return true;
}

function loop(now) {
  raf = 0;
  if (!sky || !palette.to) return;
  const reduced = motionReduced();
  if (sky.dirty || palette.from || (!reduced && now - sky.last > 50)) {
    const { gl, u } = sky;
    const c = paletteAt(now);
    gl.uniform3fv(u.uA, c[0]); gl.uniform3fv(u.uB, c[1]); gl.uniform3fv(u.uG1, c[2]); gl.uniform3fv(u.uG2, c[3]); gl.uniform3fv(u.uG3, c[4]);
    gl.uniform1f(u.uT, reduced ? 40 : (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    sky.last = now;
    sky.dirty = false;
  }
  if (!reduced || palette.from) raf = requestAnimationFrame(loop);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

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
  current = MODULES[page] || 'smartcare';
  const target = LOOKS[current].sky.map(rgb);
  palette.from = !instant && palette.to && !motionReduced() ? (palette.cur || palette.to) : null;
  palette.to = target;
  palette.cur = null;
  palette.t0 = performance.now();
  paintVars();
  if (sky) sky.dirty = true;
  kick();
}

// ---------- renders ----------

/** A page's render slot: the intro plays on arrival and rests on its last frame; scan loops. */
export function createRender(slot, page) {
  const key = MODULES[page] || 'smartcare';
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
  slot.append(still, video);
  slot.dataset.cmm = key;
  let scanning = false;

  const show = (which) => { slot.dataset.show = which; };
  async function play(name, loop) {
    const src = skin.url(`${key}/${name}.mov`);
    if (!src || !skin.movies || motionReduced()) return false;
    if (video.dataset.src !== src) { video.src = src; video.dataset.src = src; }
    video.loop = loop;
    try {
      video.currentTime = 0;
      await video.play();
      show('video');
      return true;
    } catch { return false; }
  }
  function rest() {
    still.src = skin.url(`${key}/rest.png`);
    show(skin.has ? 'still' : 'none');
  }

  const api = {
    async intro() {
      slot.classList.toggle('is-empty', !skin.has);
      if (scanning) { api.scan(true); return; }
      rest();
      slot.classList.remove('is-arriving');
      if (!(await play('intro', false)) && skin.has && !motionReduced()) {
        void slot.offsetWidth;
        slot.classList.add('is-arriving');
      }
    },
    async scan(on) {
      if (on === scanning && slot.dataset.show) return;
      scanning = on;
      if (on) {
        const ok = await play('scan', true);
        if (!ok) rest();
        slot.classList.toggle('is-scanning', !ok && skin.has);
      } else {
        slot.classList.remove('is-scanning');
        video.pause();
        rest();
      }
    },
    paint() { slot.classList.toggle('is-empty', !skin.has); if (slot.dataset.show !== 'video') rest(); },
  };
  return api;
}

/** Small images from the skin: sidebar icons (side-on/side-off), tile icons, extras. */
export const iconOf = (page, kind = 'side-off') => skin.url(`${MODULES[page] || page}/${kind}.png`);
export const extraOf = (name) => skin.url(`extra/${name}.png`);

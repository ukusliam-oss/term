// Home's hero object: this week's A/B letter in polished chrome, standing on a dark mirror floor.
// It is the answer to the first question an A/B timetable raises — "which week is it?" — and it is
// a control: drag it to turn over to next week's letter, tap it to open that week's timetable.
// Its rim light and the aura behind it take the colour of the lesson that's on now or next, the
// way CleanMyMac gives each state its own colour world.

import * as THREE from 'three';
import { FontLoader } from '../vendor/three/addons/FontLoader.js';
import { TextGeometry } from '../vendor/three/addons/TextGeometry.js';
import { springValue, motionReduced } from './motion/animate.js';
import { springs } from './motion/spring.js';
import { drag, project } from './motion/gesture.js';

const FONT_URL = 'vendor/three/fonts/helvetiker_bold.typeface.json';
let fontPromise = null;
const loadFont = () => (fontPromise ||= new Promise((res, rej) => new FontLoader().load(FONT_URL, res, undefined, rej)));

// Black studio lit by thin softbox bands: chrome only reads as chrome when there's something
// bright and narrow to reflect. (Iridescence was tried and turned the faces black.)
function studio(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(40, 24, 40), new THREE.MeshBasicMaterial({ color: 0x0b0b0d, side: THREE.BackSide })));
  const strip = (w, h, color, k, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    scene.add(m);
  };
  strip(30, 5, 0xffffff, 10, [0, 11.8, 0], [Math.PI / 2, 0, 0]);
  strip(40, 1.1, 0xffffff, 12, [0, 3.4, 19.8], [0, Math.PI, 0]);
  strip(40, 0.6, 0xffffff, 7, [0, -1.6, 19.8], [0, Math.PI, 0]);
  strip(40, 7, 0x9aa0aa, 0.8, [0, -7, 19.9], [0, Math.PI, 0]);
  strip(2.4, 22, 0xffffff, 9, [-11, 0, 19.7], [0, Math.PI, 0]);
  strip(1.2, 22, 0xbfdcff, 7, [9, 0, 19.7], [0, Math.PI, 0]);
  strip(4, 18, 0xffffff, 8, [-19.8, 2, 4], [0, Math.PI / 2, 0]);
  strip(3, 18, 0xa8d0ff, 7, [19.8, 1, -2], [0, -Math.PI / 2, 0]);
  strip(12, 2.5, 0xffc8a8, 6, [-6, -7, -19.8], [0, 0, 0.3]);
  strip(40, 3, 0x30303a, 3, [0, -11.8, 0], [Math.PI / 2, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.035).texture;
  pmrem.dispose();
  return env;
}

/** Radial alpha so the mirror floor fades into the black. */
function floorAlpha() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, '#6a6a6a');
  r.addColorStop(0.55, '#d8d8d8');
  r.addColorStop(1, '#ffffff');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createHero3D(host, { onFlip, onTap } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    host.classList.add('is-fallback');
    return { set() {}, flipTo() {}, destroy() {} };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = studio(renderer);
  const camera = new THREE.PerspectiveCamera(24, 2, 0.1, 200);

  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f8, metalness: 1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
  const mirrorMat = chrome.clone();
  mirrorMat.envMapIntensity = 0.55;
  const letter = new THREE.Mesh(new THREE.BufferGeometry(), chrome);
  const mirror = new THREE.Mesh(new THREE.BufferGeometry(), mirrorMat);
  mirror.scale.y = -1;
  const FLOOR = -5.6;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, alphaMap: floorAlpha() }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  scene.add(letter, mirror, floor);

  const rim = new THREE.DirectionalLight(0xffffff, 2.4);
  rim.position.set(-9, 7, -10);
  scene.add(rim);
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(6, 10, 12);
  scene.add(key);

  // ---------- geometry ----------

  const geos = new Map();
  let font = null;
  function geometry(ch) {
    if (!geos.has(ch)) {
      const g = new TextGeometry(ch, { font, size: 10, depth: 2.8, curveSegments: 28, bevelEnabled: true, bevelThickness: 0.75, bevelSize: 0.42, bevelSegments: 16 });
      g.computeBoundingBox();
      const b = g.boundingBox;
      g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      geos.set(ch, g);
    }
    return geos.get(ch);
  }

  // ---------- state ----------

  const reduced = motionReduced();
  let letters = ['A', 'B'];
  let shown = '';
  const rot = springValue(0, null); // 0 = this week, π = next week
  const enter = springValue(reduced ? 1 : 0, null);
  const px = springValue(0, null);
  let index = 0;
  let dragging = false;
  let scrollP = 0;
  let visible = true;
  let raf = 0;
  const t0 = performance.now();

  function size() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fitH = 15.5 / (2 * Math.tan(THREE.MathUtils.degToRad(12)));
    const fitW = 13 / (2 * Math.tan(THREE.MathUtils.degToRad(12)) * camera.aspect);
    camera.position.set(0, 3.4, Math.max(fitH, fitW));
    camera.lookAt(0, -0.4, 0);
    camera.updateProjectionMatrix();
    frame();
  }

  function frame() {
    if (!font) return;
    const t = (performance.now() - t0) / 1000;
    const r = rot.current();
    const turns = Math.round(r / Math.PI);
    const face = letters[((turns % 2) + 2) % 2];
    if (face !== shown) {
      shown = face;
      letter.geometry = geometry(face);
      mirror.geometry = letter.geometry;
    }
    const e = enter.current();
    const sway = reduced || dragging ? 0 : Math.sin(t * 0.5) * 0.12;
    const y = -5.6 + (1 - e) * -2.5 + (reduced ? 0 : Math.sin(t * 0.9) * 0.08);
    letter.position.set(0, y, 0);
    letter.rotation.set(scrollP * 0.25, r - turns * Math.PI + sway + px.current() * 0.25, 0);
    mirror.position.set(0, 2 * FLOOR - y, 0);
    mirror.rotation.set(-letter.rotation.x, letter.rotation.y, 0);
    renderer.render(scene, camera);
  }
  function loop() {
    raf = 0;
    if (!visible || document.hidden) return;
    frame();
    if (!reduced || rot.running || enter.running || px.running) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  // ---------- interaction ----------

  let base = 0;
  let moved = false;
  drag(host, {
    axis: 'x', threshold: 6,
    onStart() { dragging = true; moved = true; base = rot.current(); kick(); },
    onMove({ dx }) {
      const w = host.clientWidth || 1;
      const v = base + (dx / (w * 0.55)) * Math.PI;
      rot.set(Math.max(-0.5, Math.min(Math.PI + 0.5, v)));
      kick();
    },
    onEnd({ vx }) {
      dragging = false;
      const w = host.clientWidth || 1;
      const proj = rot.value + (project(vx) / (w * 0.55)) * Math.PI * 0.35;
      const next = proj > Math.PI / 2 ? 1 : 0;
      rot.to(next * Math.PI, springs.snappy, (vx / (w * 0.55)) * Math.PI);
      if (next !== index) { index = next; onFlip?.(index); }
      kick();
    },
  });
  host.addEventListener('pointerdown', () => { moved = false; });
  host.addEventListener('click', () => { if (!moved) onTap?.(index); });
  host.addEventListener('pointermove', (ev) => {
    if (reduced || dragging || ev.pointerType !== 'mouse') return;
    const r = host.getBoundingClientRect();
    px.to(((ev.clientX - r.left) / r.width - 0.5), springs.gentle);
    kick();
  });
  host.addEventListener('pointerleave', () => { px.to(0, springs.gentle); kick(); });
  const onScroll = () => {
    const r = host.getBoundingClientRect();
    scrollP = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
    kick();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); });
  io.observe(host);
  const ro = new ResizeObserver(size);
  ro.observe(host);
  document.addEventListener('visibilitychange', kick);

  loadFont().then((f) => {
    font = f;
    size();
    host.classList.add('is-live');
    if (!reduced) enter.to(1, springs.gentle);
    kick();
  }).catch(() => host.classList.add('is-fallback'));

  return {
    /** letters: [this week's letter, next week's letter]; tint: hex of the lesson now/next. */
    set({ letters: l, tint }) {
      letters = l;
      rim.color.set(tint || '#ffffff');
      host.style.setProperty('--glow', tint || 'transparent');
      kick();
    },
    flipTo(i) {
      if (i === index) return;
      index = i;
      rot.to(i * Math.PI, springs.snappy);
      kick();
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('scroll', onScroll);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

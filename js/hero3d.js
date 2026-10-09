// The Home hero's product shot, rendered live: this week's letter in polished chrome standing in a
// dark studio, with a slab in the next lesson's subject colour lying in front of it — its top face
// shows that lesson the way a device shows its screen. Softbox strips in the environment give the
// chrome its streaks. (No iridescence: thin-film interference turned the faces black.)

import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/three/addons/RoundedBoxGeometry.js';
import { springValue, motionReduced } from './motion/animate.js';
import { springs } from './motion/spring.js';

// Blocky rounded letterforms, 10 units tall: [x, y, cornerRadius], outer counter-clockwise, holes clockwise.
const LETTERS = {
  A: { w: 7.6, outer: [[0, 0, 0.35], [2.5, 0, 0.35], [2.5, 2.7, 0.25], [5.1, 2.7, 0.25], [5.1, 0, 0.35], [7.6, 0, 0.35], [7.6, 10, 3.6], [0, 10, 3.6]], holes: [[[2.5, 4.9, 0.6], [2.5, 7.3, 1], [5.1, 7.3, 1], [5.1, 4.9, 0.6]]] },
  B: { w: 6.9, outer: [[0, 0, 0.35], [6.9, 0, 2.5], [6.9, 4.6, 1.3], [6.1, 5.0, 0.15], [6.5, 5.4, 1.2], [6.5, 10, 2.3], [0, 10, 0.35]], holes: [[[2.5, 2.1, 0.55], [2.5, 3.9, 0.55], [4.4, 3.9, 0.55], [4.4, 2.1, 0.55]], [[2.5, 6.3, 0.55], [2.5, 7.9, 0.55], [4.1, 7.9, 0.55], [4.1, 6.3, 0.55]]] },
};

function roundedPath(path, pts) {
  const K = 0.5523;
  const n = pts.length;
  pts.forEach(([x, y, r], i) => {
    const [px, py] = pts[(i - 1 + n) % n];
    const [nx, ny] = pts[(i + 1) % n];
    const l1 = Math.hypot(px - x, py - y);
    const l2 = Math.hypot(nx - x, ny - y);
    const d1 = Math.min(r, l1 / 2);
    const d2 = Math.min(r, l2 / 2);
    const a = [x + ((px - x) / l1) * d1, y + ((py - y) / l1) * d1];
    const b = [x + ((nx - x) / l2) * d2, y + ((ny - y) / l2) * d2];
    if (i === 0) path.moveTo(a[0], a[1]);
    else path.lineTo(a[0], a[1]);
    path.bezierCurveTo(a[0] + (x - a[0]) * K, a[1] + (y - a[1]) * K, b[0] + (x - b[0]) * K, b[1] + (y - b[1]) * K, b[0], b[1]);
  });
  path.closePath();
}

function letterGeometry(ch) {
  const def = LETTERS[ch] || LETTERS.A;
  const shape = new THREE.Shape();
  roundedPath(shape, def.outer);
  for (const hole of def.holes) {
    const p = new THREE.Path();
    roundedPath(p, hole);
    shape.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.36, bevelSegments: 10, curveSegments: 28 });
  g.center();
  return g;
}

// A black studio lit by softbox strips — what chrome needs to look like chrome.
function studio(renderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 24, 40), new THREE.MeshBasicMaterial({ color: 0x0c0c0e, side: THREE.BackSide }));
  scene.add(room);
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

function screenTexture({ label, title, detail, accent }) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 496;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1024, 496);
  bg.addColorStop(0, '#16161a');
  bg.addColorStop(1, '#050507');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 496);
  const font = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
  g.fillStyle = accent;
  g.font = `600 44px ${font}`;
  g.fillText(label, 64, 120);
  g.fillStyle = '#f5f5f7';
  let size = 112;
  g.font = `600 ${size}px ${font}`;
  while (g.measureText(title).width > 896 && size > 56) { size -= 4; g.font = `600 ${size}px ${font}`; }
  g.fillText(title, 60, 120 + 24 + size * 0.95);
  g.fillStyle = '#86868b';
  g.font = `400 52px ${font}`;
  g.fillText(detail, 64, 430);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createHero3D(host) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    host.classList.add('is-fallback');
    return { set() {}, destroy() {} };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = studio(renderer);
  const camera = new THREE.PerspectiveCamera(26, 2, 0.1, 200);
  const rig = new THREE.Group();
  scene.add(rig);

  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xf4f4f8, metalness: 1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2,
  });
  const letter = new THREE.Mesh(letterGeometry('A'), chrome);
  letter.scale.setScalar(0.95);
  letter.position.set(0, 2.2, -2);
  rig.add(letter);

  const slab = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color: 0x6b2d3a, metalness: 0.8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 1.1 });
  slab.add(new THREE.Mesh(new RoundedBoxGeometry(11.2, 0.72, 5.4, 6, 0.34), body));
  const glassMat = new THREE.MeshPhysicalMaterial({ roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0xffffff, emissiveIntensity: 0.85, envMapIntensity: 0.6 });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 4.6), glassMat);
  glass.rotation.x = -Math.PI / 2;
  glass.position.y = 0.37;
  slab.add(glass);
  slab.scale.setScalar(1.08);
  slab.position.set(0.3, -3.1, 4.6);
  slab.rotation.set(0.36, -0.16, 0.02);
  rig.add(slab);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-6, 12, 10);
  scene.add(key);

  // motion: entrance, idle sway, pointer parallax, scroll
  const reduced = motionReduced();
  const enter = springValue(reduced ? 1 : 0, null);
  const px = springValue(0, null);
  const py = springValue(0, null);
  let scrollP = 0;
  let visible = true;
  let raf = 0;
  const t0 = performance.now();

  function size() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fitW = 16 / (2 * Math.tan(THREE.MathUtils.degToRad(13)) * camera.aspect);
    camera.position.set(0, 3.2, Math.max(34, fitW));
    camera.lookAt(0, -0.5, 0);
    camera.updateProjectionMatrix();
    frame();
  }

  function frame() {
    const t = (performance.now() - t0) / 1000;
    const e = enter.current();
    const sway = -0.28 + (reduced ? 0 : Math.sin(t * 0.45) * 0.14);
    letter.rotation.y = sway + px.current() * 0.35 + (1 - e) * -0.9;
    letter.rotation.x = py.current() * 0.12 + scrollP * 0.35;
    letter.position.y = 2.2 + (1 - e) * -3;
    slab.position.z = 4.6 + (1 - e) * 9;
    slab.position.y = -3.1 + (reduced ? 0 : Math.sin(t * 0.8) * 0.06) - scrollP * 1.2;
    slab.rotation.y = -0.16 + px.current() * 0.12;
    rig.rotation.y = px.current() * 0.05;
    chrome.opacity = 1;
    renderer.render(scene, camera);
  }
  function loop() {
    raf = 0;
    if (!visible || document.hidden) return;
    frame();
    if (!reduced || enter.running || px.running || py.running) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); });
  io.observe(host);
  const ro = new ResizeObserver(size);
  ro.observe(host);
  const onMove = (ev) => {
    if (reduced) return;
    const r = host.getBoundingClientRect();
    px.to(((ev.clientX - r.left) / r.width - 0.5) * 2, springs.gentle);
    py.to(((ev.clientY - r.top) / r.height - 0.5) * 2, springs.gentle);
    kick();
  };
  const onLeave = () => { px.to(0, springs.gentle); py.to(0, springs.gentle); kick(); };
  const onScroll = () => {
    const r = host.getBoundingClientRect();
    scrollP = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
    kick();
  };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', kick);
  size();
  if (!reduced) enter.to(1, springs.gentle);
  kick();

  let current = '';
  return {
    set({ letter: ch, color, label, title, detail }) {
      const key2 = [ch, color, label, title, detail].join('|');
      if (key2 === current) return;
      const first = !current;
      if (current.split('|')[0] !== ch) { letter.geometry.dispose(); letter.geometry = letterGeometry(ch); }
      current = key2;
      body.color.set(color || '#6b2d3a').multiplyScalar(0.62);
      glassMat.map?.dispose();
      glassMat.map = screenTexture({ label, title, detail, accent: color || '#ff791b' });
      glassMat.emissiveMap = glassMat.map;
      glassMat.needsUpdate = true;
      if (!first && !reduced) { enter.set(0.82); enter.to(1, springs.snappy); }
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

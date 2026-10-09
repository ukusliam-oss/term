// CleanMyMac's sounds, from the skin: the round button's click down and up, Scan Finished when a
// focus session completes, Clean Finished when something is ticked off, the error sound with an
// error, and the intro wipe when the skin goes in. Web Audio, decoded ahead, so clicks land on the
// press rather than after it. Browsers start audio only after a gesture; the first press unlocks it.

import { skin } from './skin.js';

let ctx = null;
let enabled = true;
const buffers = new Map();

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function load(name) {
  if (!buffers.has(name)) {
    const url = skin.url(`sound/${name}.m4a`);
    const c = context();
    buffers.set(name, url && c ? fetch(url).then((r) => r.arrayBuffer()).then((b) => new Promise((res, rej) => c.decodeAudioData(b, res, rej))).catch(() => null) : Promise.resolve(null));
  }
  return buffers.get(name);
}

function preload() {
  buffers.clear();
  if (!skin.has) return;
  for (const n of ['down', 'up', 'clean-finished', 'scan-finished', 'error', 'wipe']) load(n);
}
skin.onChange(preload);

const unlock = () => { const c = context(); if (c?.state === 'suspended') c.resume(); };
window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
window.addEventListener('keydown', unlock, { capture: true });

export function setSounds(on) { enabled = on !== false; }

export async function play(name, volume = 1) {
  if (!enabled || !skin.has) return;
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  const buf = await load(name);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = volume;
  src.connect(g).connect(c.destination);
  src.start();
}

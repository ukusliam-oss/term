// FLIP layout animation for keyed elements ([data-flip="key"]). Positions are captured as drawn —
// transforms included — and in-flight velocity is carried over, so a list that re-renders while
// rows are still moving continues smoothly instead of jumping.

import { motion, existingMotion } from './animate.js';
import { springs } from './spring.js';

export function capture(root) {
  const map = new Map();
  for (const el of root.querySelectorAll('[data-flip]')) {
    const m = existingMotion(el);
    map.set(el.dataset.flip, {
      el,
      rect: el.getBoundingClientRect(),
      vx: m ? m.velocity('x') : 0,
      vy: m ? m.velocity('y') : 0,
    });
  }
  return map;
}

export function play(root, before, { spring = springs.snappy, enter = true, exit = false } = {}) {
  const seen = new Set();
  for (const el of root.querySelectorAll('[data-flip]')) {
    const key = el.dataset.flip;
    const prev = before.get(key);
    seen.add(key);
    if (prev) {
      const m = motion(el);
      // Layout position without whatever transform the element is carrying now.
      const r = el.getBoundingClientRect();
      const lx = r.left - m.get('x');
      const ly = r.top - m.get('y');
      const dx = prev.rect.left - lx;
      const dy = prev.rect.top - ly;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        m.set({ x: dx, y: dy });
        m.to({ x: 0, y: 0 }, spring, { velocity: { x: prev.vx, y: prev.vy } });
      }
    } else if (enter && before.size) {
      const m = motion(el);
      m.set({ opacity: 0, scale: 0.94 });
      m.to({ opacity: 1, scale: 1 }, springs.smooth);
    }
  }
  if (!exit) return;
  const hr = root.getBoundingClientRect();
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  for (const [key, prev] of before) {
    if (seen.has(key) || prev.el.isConnected) continue;
    const g = prev.el;
    g.removeAttribute('data-flip');
    Object.assign(g.style, {
      position: 'absolute',
      left: `${prev.rect.left - hr.left + root.scrollLeft}px`,
      top: `${prev.rect.top - hr.top + root.scrollTop}px`,
      width: `${prev.rect.width}px`,
      height: `${prev.rect.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '0',
      transform: '',
    });
    root.append(g);
    const m = motion(g);
    m.clear();
    m.to({ opacity: 0, scale: 0.9 }, springs.smooth).then(() => g.remove());
  }
}

/** Replace root's children with build()'s output and animate keyed elements between layouts. */
export function flipRender(root, build, opts) {
  const before = capture(root);
  const out = build();
  root.replaceChildren(...[out].flat(Infinity).filter(Boolean));
  play(root, before, opts);
}

// Segmented control (as on the Store's buy pages): a grey track with a white thumb that springs
// between options, keeps its velocity when retargeted, and can be dragged.

import { h, clamp } from './dom.js';
import { springValue } from '../motion/animate.js';
import { springs } from '../motion/spring.js';
import { drag, rubberband, project } from '../motion/gesture.js';

export function segment({ options, value, onChange, label, cls = '' }) {
  const thumb = h('span.seg-thumb', { 'aria-hidden': 'true' });
  const btns = options.map((o) => h('button.seg-opt', {
    type: 'button', role: 'radio', 'aria-checked': String(o.value === value), onclick: () => select(o.value, true),
  }, o.label));
  const el = h(`div.seg${cls ? `.${cls}` : ''}`, { role: 'radiogroup', 'aria-label': label, style: { '--n': options.length } }, thumb, ...btns);
  let current = value;
  const x = springValue(0, (v, vel) => {
    const s = Math.min(Math.abs(vel) / 4000, 0.1);
    thumb.style.transform = `translate3d(${v.toFixed(2)}px,0,0) scaleX(${(1 + s).toFixed(4)})`;
  });
  const idx = () => Math.max(0, options.findIndex((o) => o.value === current));
  const w = () => btns[0].offsetWidth;
  const place = (animate, v) => { const tx = btns[idx()].offsetLeft - btns[0].offsetLeft; animate ? x.to(tx, springs.snappy, v) : x.set(tx); };
  function select(v, user, vel) {
    const changed = v !== current;
    current = v;
    btns.forEach((b, i) => b.setAttribute('aria-checked', String(options[i].value === v)));
    place(true, vel);
    if (changed && user) onChange?.(v);
  }
  let start = 0;
  drag(el, {
    axis: 'x', threshold: 4,
    shouldStart: (e) => e.target.closest('.seg-opt') === btns[idx()],
    onStart() { start = x.current(); },
    onMove({ dx }) {
      const max = btns[btns.length - 1].offsetLeft - btns[0].offsetLeft;
      let v = start + dx;
      if (v < 0) v = rubberband(v, w());
      else if (v > max) v = max + rubberband(v - max, w());
      x.set(v);
    },
    onEnd({ vx }) {
      const i = clamp(Math.round((x.value + project(vx) * 0.15) / w()), 0, options.length - 1);
      select(options[i].value, true, vx);
    },
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = clamp(idx() + (e.key === 'ArrowRight' ? 1 : -1), 0, options.length - 1);
    select(options[i].value, true);
    btns[i].focus();
  });
  new ResizeObserver(() => place(false)).observe(el);
  el.set = (v) => select(v, false);
  return el;
}

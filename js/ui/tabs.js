// Tab nav with an underline that springs between items, keeping its velocity when retargeted.

import { h, clamp } from './dom.js';
import { springValue } from '../motion/animate.js';
import { springs } from '../motion/spring.js';

export function tabs({ options, value, onChange, label, cls = '' }) {
  const ind = h('span.tabs-ind', { 'aria-hidden': 'true' });
  const btns = options.map((o) => h(`button.tabs-item${o.cls ? `.${o.cls}` : ''}`, {
    type: 'button', role: 'tab', 'aria-selected': String(o.value === value), onclick: () => select(o.value, true),
  }, o.label, o.sub ? h('small', { text: o.sub }) : null));
  const el = h(`div.tabs${cls ? `.${cls}` : ''}`, { role: 'tablist', 'aria-label': label }, ...btns, ind);
  let current = value;
  let w = 0;
  const x = springValue(0, (v) => paint(v, w));
  const wv = springValue(0, (v) => { w = v; paint(x.value, v); });
  function paint(px, pw) {
    ind.style.transform = `translate3d(${px.toFixed(2)}px,0,0) scaleX(${(pw / 100).toFixed(4)})`;
  }
  function place(animate) {
    const b = btns[Math.max(0, options.findIndex((o) => o.value === current))];
    if (!b) return;
    if (animate) { x.to(b.offsetLeft, springs.snappy); wv.to(b.offsetWidth, springs.snappy); }
    else { x.set(b.offsetLeft); wv.set(b.offsetWidth); }
  }
  function select(v, user) {
    const changed = v !== current;
    current = v;
    btns.forEach((b, i) => b.setAttribute('aria-selected', String(options[i].value === v)));
    place(true);
    if (changed && user) onChange?.(v);
  }
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = clamp(options.findIndex((o) => o.value === current) + (e.key === 'ArrowRight' ? 1 : -1), 0, options.length - 1);
    select(options[i].value, true);
    btns[i].focus();
  });
  new ResizeObserver(() => place(false)).observe(el);
  el.set = (v) => select(v, false);
  return el;
}

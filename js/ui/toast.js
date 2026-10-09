// Glass capsule notifications. A new toast replaces the current one; hovering holds it.

import { h, icon } from './dom.js';
import { motion } from '../motion/animate.js';
import { springs } from '../motion/spring.js';

let layer;
let current = null;

export function initToasts(host) {
  layer = h('div.toast-layer', { 'aria-live': 'polite' });
  host.append(layer);
}

function dismiss(t, replaced = false) {
  clearTimeout(t.timer);
  if (current === t) current = null;
  motion(t.el).to({ y: replaced ? -14 : 26, scale: 0.9, opacity: 0 }, springs.snappy).then(() => t.el.remove());
}

export function toast(message, { action, onAction, icon: ico = null, duration = 3800, tone = '' } = {}) {
  if (current) dismiss(current, true);
  const t = { el: null, timer: 0 };
  t.el = h(`div.toast${tone ? `.toast-${tone}` : ''}`, { role: 'status' },
    ico ? icon(ico, 18) : null,
    h('span.toast-text', { text: message }),
    action ? h('button.toast-action', { type: 'button', text: action, onclick: () => { onAction?.(); dismiss(t); } }) : null);
  layer.append(t.el);
  motion(t.el).set({ y: 34, scale: 0.86, opacity: 0 }).to({ y: 0, scale: 1, opacity: 1 }, springs.bouncy);
  t.timer = setTimeout(() => dismiss(t), duration);
  t.el.addEventListener('pointerenter', () => clearTimeout(t.timer));
  t.el.addEventListener('pointerleave', () => { t.timer = setTimeout(() => dismiss(t), 1800); });
  current = t;
  return t;
}

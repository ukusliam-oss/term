// apple.com-style modal: a white page over a dimmed scrim with a round close button. Full screen on
// phones, where it slides up and can be pulled back down; a sticky footer holds the actions.

import { h, icon, clamp, fill } from './dom.js';
import { motion } from '../motion/animate.js';
import { springs } from '../motion/spring.js';
import { drag, rubberband, project } from '../motion/gesture.js';

const stack = [];
let layer;

export function initModals(host) {
  layer = h('div.modal-layer');
  host.append(layer);
}

export const modalOpen = () => stack.length > 0;
export const closeTop = () => stack.at(-1)?.close();
const phone = () => matchMedia('(max-width: 734px)').matches;

function lock() {
  document.body.classList.toggle('is-locked', stack.length > 0);
}

/**
 * openModal({ eyebrow, title, lede, build(body, ctl), footer: [nodes], size: 'sm'|'md'|'lg', onClose })
 * ctl: { el, body, close(), setTitle(t), setFooter(...nodes) }
 */
export function openModal({ eyebrow, title, lede, build, footer, size = 'lg', onClose, label }) {
  const prevFocus = document.activeElement;
  const titleId = `m-${Math.random().toString(36).slice(2, 8)}`;
  const heading = h('h2.modal-title', { id: titleId, text: title || '' });
  const eyebrowEl = h('p.modal-eyebrow', { text: eyebrow || '' });
  eyebrowEl.hidden = !eyebrow;
  const body = h('div.modal-body');
  const foot = h('div.modal-foot');
  foot.hidden = !footer?.length;
  if (footer?.length) foot.append(...footer);
  const closeBtn = h('button.modal-close', { type: 'button', 'aria-label': 'Close', onclick: () => ctl.close() }, icon('close', 16));
  const grab = h('div.modal-grab', { 'aria-hidden': 'true' });
  const modal = h(`div.modal${size !== 'lg' ? `.modal-${size}` : ''}`, {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-label': label || null, tabindex: '-1',
  }, grab, closeBtn, eyebrowEl, heading, lede ? h('p.modal-lede', { text: lede }) : null, body, foot);
  const scrim = h('div.modal-scrim');
  const wrap = h('div.modal-wrap', null, scrim, modal);
  layer.append(wrap);

  const ctl = {
    el: modal, body, closed: false, onClose,
    setTitle: (t) => (heading.textContent = t),
    setEyebrow: (t) => { eyebrowEl.textContent = t; eyebrowEl.hidden = !t; },
    setFooter: (...nodes) => { fill(foot, ...nodes.filter(Boolean)); foot.hidden = !foot.children.length; },
    close,
  };
  const mm = motion(modal);
  const ms = motion(scrim);
  try { build?.(body, ctl); } catch (e) { wrap.remove(); throw e; }
  stack.push(ctl);
  lock();

  ms.set({ opacity: 0 }).to({ opacity: 1 }, springs.smooth);
  if (phone()) mm.set({ y: window.innerHeight }).to({ y: 0 }, springs.sheet);
  else mm.set({ y: 48, opacity: 0, scale: 0.98 }).to({ y: 0, opacity: 1, scale: 1 }, springs.snappy);

  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target === scrim) close(); });

  let h0 = 1;
  drag(grab, {
    axis: 'y', threshold: 4,
    onStart() { h0 = window.innerHeight; },
    onMove({ dy }) {
      const y = dy > 0 ? dy : rubberband(dy, h0 * 0.2);
      mm.set({ y });
      ms.set({ opacity: 1 - clamp(y / h0, 0, 1) });
    },
    onEnd({ dy, vy }) {
      if (dy + project(vy) * 0.5 > h0 * 0.3 || vy > 1000) close({ velocity: vy });
      else { mm.to({ y: 0 }, springs.sheet, { velocity: { y: vy } }); ms.to({ opacity: 1 }, springs.smooth); }
    },
  });

  requestAnimationFrame(() => (modal.querySelector('[autofocus]') || modal).focus({ preventScroll: true }));

  async function close({ velocity = 0 } = {}) {
    if (ctl.closed) return;
    ctl.closed = true;
    const i = stack.indexOf(ctl);
    if (i >= 0) stack.splice(i, 1);
    lock();
    wrap.style.pointerEvents = 'none';
    ctl.onClose?.();
    ms.to({ opacity: 0 }, springs.smooth);
    const done = phone()
      ? mm.to({ y: window.innerHeight }, springs.sheet, { velocity: { y: Math.max(0, velocity) } })
      : mm.to({ y: 32, opacity: 0, scale: 0.98 }, springs.snappy);
    if (prevFocus?.isConnected) prevFocus.focus?.({ preventScroll: true });
    await Promise.race([done, new Promise((r) => setTimeout(r, 800))]);
    wrap.remove();
  }
  return ctl;
}

/** In-page confirmation (the viewer's frame swallows window.confirm). */
export function askConfirm({ title, message, confirm = 'OK', cancel = 'Cancel', destructive = false }) {
  return new Promise((resolve) => {
    const scrim = h('div.modal-scrim');
    const finish = (v) => {
      document.removeEventListener('keydown', onKey, true);
      motion(card).to({ scale: 0.96, opacity: 0 }, springs.quick).then(() => wrap.remove());
      motion(scrim).to({ opacity: 0 }, springs.quick);
      resolve(v);
    };
    const ok = h(`button.button.button-elevated${destructive ? '.button-danger' : ''}`, { type: 'button', text: confirm, onclick: () => finish(true) });
    const card = h('div.alert', { role: 'alertdialog', 'aria-modal': 'true' },
      h('p.alert-title', { text: title }),
      message ? h('p.alert-msg', { text: message }) : null,
      h('div.button-group', null, h('button.button.button-elevated.button-gray', { type: 'button', text: cancel, onclick: () => finish(false) }), ok));
    const wrap = h('div.alert-wrap', null, scrim, card);
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
    document.addEventListener('keydown', onKey, true);
    layer.append(wrap);
    motion(scrim).set({ opacity: 0 }).to({ opacity: 1 }, springs.quick);
    motion(card).set({ scale: 1.08, opacity: 0 }).to({ scale: 1, opacity: 1 }, springs.snappy);
    requestAnimationFrame(() => ok.focus());
  });
}

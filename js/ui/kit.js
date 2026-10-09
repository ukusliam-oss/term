// apple.com building blocks: sk-buttons, "more ›" links, Store cards and shelves, form-textbox,
// dimension tiles, hairline rows, stats.

import { h, icon, fill } from './dom.js';
import { motion, springValue } from '../motion/animate.js';
import { springs } from '../motion/spring.js';

export const COLORS = ['red', 'orange', 'yellow', 'green', 'mint', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'brown', 'gray'];
export const cvar = (name) => (name === 'blue' ? 'var(--blue-sys)' : `var(--${COLORS.includes(name) ? name : 'gray'})`);
export const tint = (color) => ({ '--c': cvar(color) });

export function btn(label, onClick, { variant = '', size = '', ico, id, type = 'button', disabled, cls = '' } = {}) {
  const c = ['button', size && `button-${size}`, variant && `button-${variant}`, cls].filter(Boolean).join('.');
  return h(`button.${c}`, { type, onclick: onClick, id, disabled }, ico ? icon(ico, 16) : null, h('span', { text: label }));
}

export function more(label, onClick, cls = '') {
  return h(`button.more${cls ? `.${cls}` : ''}`, { type: 'button', onclick: onClick }, h('span', { text: label }), icon('chev', 12));
}

export function dot(color, cls = '') {
  return h(`span.dot${cls ? `.${cls}` : ''}`, { style: tint(color), 'aria-hidden': 'true' });
}

export function twoTone(strong, soft, cls = 'shelf-title') {
  return h(`h2.${cls}.two-tone`, null, h('span', { text: `${strong} ` }), h('span', { text: soft }));
}

/** A Store card. Pass onClick to make the whole card a link. */
export function card({ eyebrow, title, desc, foot, onClick, flip, color, cls = '', small = false, children }) {
  const tag = onClick ? 'button' : 'div';
  return h(`${tag}.card${onClick ? '.is-link' : ''}${cls ? `.${cls}` : ''}`, {
    type: onClick ? 'button' : null, onclick: onClick, dataset: flip ? { flip } : null, style: color ? tint(color) : null,
  },
  h('div.card-info', null,
    eyebrow ? h('p.card-eyebrow', null, eyebrow) : null,
    h(`p.card-title${small ? '.card-title-sm' : ''}`, null, title),
    desc ? h('p.card-desc', null, desc) : null,
    children || null,
    foot ? h('div.card-foot', null, foot) : null));
}

/** A horizontally scrolling shelf of cards with paddle buttons, as on the Store. */
export function shelf({ strong, soft, cards, id, after }) {
  const platter = h('div.shelf-platter', { role: 'list' }, ...cards.map((c) => { c.setAttribute('role', 'listitem'); return c; }));
  const scroller = h('div.shelf-scroller', null, platter);
  const prev = h('button.paddle', { type: 'button', 'aria-label': 'Previous', onclick: () => go(-1) }, icon('left', 16));
  const next = h('button.paddle', { type: 'button', 'aria-label': 'Next', onclick: () => go(1) }, icon('chev', 16));
  function go(d) {
    const w = platter.firstElementChild?.getBoundingClientRect().width || 300;
    scroller.scrollBy({ left: d * (w + 20) * Math.max(1, Math.floor(scroller.clientWidth / (w + 20)) - 0), behavior: 'smooth' });
  }
  const sync = () => {
    prev.disabled = scroller.scrollLeft <= 2;
    next.disabled = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
  };
  scroller.addEventListener('scroll', sync, { passive: true });
  new ResizeObserver(sync).observe(scroller);
  requestAnimationFrame(sync);
  return h('section.shelf', { id },
    h('div.wrap', null, h('div.shelf-head', null, twoTone(strong, soft), after || null)),
    scroller,
    h('div.wrap', null, h('div.paddles', null, prev, next)));
}

export function field({ id, label, value = '', type = 'text', onInput, onChange, autofocus, inputmode, min, max, step, area = false, rows = 3 }) {
  const input = area
    ? h('textarea.field-input', { id, rows, placeholder: ' ', autofocus })
    : h('input.field-input', { id, type, placeholder: ' ', autocomplete: 'off', autofocus, inputmode, min, max, step });
  input.value = value ?? '';
  if (onInput) input.addEventListener('input', () => onInput(input.value, input));
  if (onChange) input.addEventListener('change', () => onChange(input.value, input));
  const el = h(`div.field${area ? '.field-area' : ''}`, null, input, h('label.field-label', { for: id, text: label }));
  el.input = input;
  return el;
}

export function dropdown({ id, label, options, value, onChange }) {
  const sel = h('select.field-input.field-select', { id }, ...options.map((o) => h('option', { value: o.value, text: o.label })));
  sel.value = value ?? '';
  sel.addEventListener('change', () => onChange?.(sel.value));
  const el = h('div.field', null, sel, h('label.field-label', { for: id, text: label }), icon('down', 14, 'field-chev'));
  el.input = sel;
  return el;
}

/** Store-style dimension tiles; a radiogroup. */
export function tiles({ options, value, onChange, cols = 2, label, compact = false }) {
  const el = h(`div.tiles${compact ? '.tiles-compact' : ''}`, { role: 'radiogroup', 'aria-label': label, style: { '--cols': cols } });
  const render = () => fill(el, ...options.map((o) => h('button.tile-opt', {
    type: 'button', role: 'radio', 'aria-checked': String(o.value === value), disabled: o.disabled,
    onclick: () => { if (value === o.value && !o.toggle) return; value = o.toggle && value === o.value ? null : o.value; render(); onChange?.(value); },
  },
  h('span.tile-label', null, o.color ? dot(o.color) : null, h('span', { text: o.label })),
  o.sub ? h('span.tile-sub', { text: o.sub }) : null)));
  render();
  el.set = (v) => { value = v; render(); };
  return el;
}

export function pills(options, value, onChange) {
  const el = h('div.pills', { role: 'toolbar' });
  const render = () => fill(el, ...options.map((o) => h('button.pill-btn', {
    type: 'button', 'aria-pressed': String(o.value === value), onclick: () => { value = o.value; render(); onChange(o.value); },
  }, o.color ? dot(o.color, 'dot-sm') : null, o.label)));
  render();
  return el;
}

export function checkbox({ id, label, sub, checked, onChange }) {
  const input = h('input', { type: 'checkbox', id, checked });
  input.addEventListener('change', () => onChange?.(input.checked));
  return h('label.checkbox', { for: id }, input, h('span.checkbox-box', null, icon('check', 14)),
    h('span', null, label, sub ? h('span.checkbox-sub', { text: sub }) : null));
}

/** Reminders-style circle for to-dos. */
export function check({ checked = false, label = 'Done', onChange }) {
  const b = h('button.check', { type: 'button', role: 'checkbox', 'aria-checked': String(checked), 'aria-label': label }, icon('check', 13));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(next));
    motion(b).set({ scale: next ? 0.8 : 0.92 }).to({ scale: 1 }, springs.bouncy);
    onChange?.(next);
  });
  return b;
}

export function swatches(selected, onPick, label = 'Colour') {
  const el = h('div.swatches', { role: 'radiogroup', 'aria-label': label });
  for (const c of COLORS) {
    const b = h('button.swatch', {
      type: 'button', role: 'radio', 'aria-checked': String(c === selected), 'aria-label': c, title: c, style: tint(c),
      onclick: () => { el.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-checked', String(x === b))); onPick(c); },
    });
    el.append(b);
  }
  return el;
}

/** Hairline row: lead · title/sub · trail. */
export function hrow({ lead, title, sub, trail, onClick, flip, cls = '', chevron = false }) {
  const tag = onClick ? 'button' : 'div';
  return h(`${tag}.hrow${cls ? `.${cls}` : ''}`, { type: onClick ? 'button' : null, onclick: onClick, dataset: flip ? { flip } : null },
    lead != null ? h('span.hrow-lead', null, lead) : null,
    h('span.hrow-main', null, h('span.hrow-title', null, title), sub ? h('span.hrow-sub', null, sub) : null),
    trail != null ? h('span.hrow-trail', null, trail) : null,
    chevron ? icon('chev', 13, 'chev') : null);
}

export function emptyState({ title, text, action }) {
  return h('div.empty', null,
    h('p.empty-title', { text: title }),
    text ? h('p.empty-text', { text }) : null,
    action ? (action.button ? btn(action.label, action.onClick) : more(action.label, action.onClick)) : null);
}

/** Big apple.com statistic; counts up the first time it appears. */
export function stat({ value, unit = '', caption, gradient = true, small = false, count = true }) {
  const v = h(`span.stat-value${gradient ? '.gradient' : ''}`);
  const write = (n) => { fill(v, String(n), unit ? h('small', { text: unit }) : ''); };
  const num = typeof value === 'number' ? value : null;
  if (num != null && count && num > 1) {
    write(0);
    const sv = springValue(0, (x) => write(Math.round(x)));
    requestAnimationFrame(() => sv.to(num, springs.gentle));
  } else write(value);
  return h(`div.stat${small ? '.stat-sm' : ''}`, null, v, caption ? h('span.stat-caption', { text: caption }) : null);
}

export function progress(p) {
  const el = h('div.progress', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p * 100), style: { '--p': p.toFixed(4) } }, h('i'));
  el.set = (x) => { el.style.setProperty('--p', x.toFixed(4)); el.setAttribute('aria-valuenow', Math.round(x * 100)); };
  return el;
}

export function blockHead(strong, soft) {
  return h('h3.block-head', null, `${strong} `, soft ? h('span', { text: soft }) : null);
}

export function kbd(text) {
  return h('kbd', { text });
}

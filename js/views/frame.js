// A page: an apple.com section heading (title, a soft line under it) with the page's controls on
// the right — always visible, never folded into a menu — then the content.

import { h, fill } from '../ui/dom.js';

export function pageFrame({ id, title, sub = '', alt = false }) {
  const titleEl = h('h1.page-title', { text: title });
  const subEl = h('p.page-sub', { text: sub });
  const controls = h('div.page-controls');
  const head = h('header.page-head', null, h('div.wrap.page-head-inner', null, h('div.page-head-text', null, titleEl, subEl), controls));
  const body = h('div.page-body');
  const el = h(`section.view${alt ? '.view-alt' : ''}`, { id: `view-${id}`, hidden: true, 'aria-labelledby': `${id}-title` }, head, body);
  titleEl.id = `${id}-title`;
  return {
    el, head, body, controls,
    setSub: (t) => { if (subEl.textContent !== t) subEl.textContent = t; },
    setControls: (...nodes) => fill(controls, ...nodes),
  };
}

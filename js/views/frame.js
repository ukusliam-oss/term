// A module page, as CleanMyMac opens every module: the module's render centred (its intro plays as
// you arrive), a large regular-weight title, a one-line subtitle in 70% white, then the page's
// controls and content.

import { h, fill } from '../ui/dom.js';
import { createRender } from '../stage.js';

export function pageFrame({ id, title, sub = '' }) {
  const render = h('div.mod-render', { 'aria-hidden': 'true' });
  const art = createRender(render, id);
  const titleEl = h('h1.mod-title', { text: title, id: `${id}-title` });
  const subEl = h('p.mod-sub', { text: sub });
  const controls = h('div.mod-actions');
  const head = h('header.mod-hero', null, render, titleEl, subEl, controls);
  const body = h('div.mod-body');
  const el = h(`section.view.view-${id}`, { id: `view-${id}`, hidden: true, 'aria-labelledby': `${id}-title` }, head, body);
  return {
    el, head, body, controls, render, art,
    setTitle: (t, num = false) => { if (titleEl.textContent !== t) titleEl.textContent = t; titleEl.classList.toggle('num', num); },
    setSub: (t) => { if (subEl.textContent !== t) subEl.textContent = t; },
    setControls: (...nodes) => fill(controls, ...nodes),
  };
}
